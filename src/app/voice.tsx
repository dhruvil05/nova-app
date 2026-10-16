import WakeWord from '@modules/wake-word';
import { router, useLocalSearchParams } from 'expo-router';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, View } from 'react-native';

import { useChatStore } from '@/ai/chatStore';
import { describeTool } from '@/ai/transcript';
import { useBindChat } from '@/ai/useChat';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/chat/ConfirmSheet';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { Toggle } from '@/components/Toggle';
import { useSettingsRepo } from '@/db/hooks';
import * as player from '@/services/player';
import { makeStyles, useTheme } from '@/theme';
import { loadVoicePrefs, type VoicePrefs } from '@/voice/prefs';
import {
  GOOGLE_RECOGNIZER,
  SILENCE_TIMEOUT_MS,
  cancelListening,
  describeSpeechError,
  ensureMicPermission,
  finishListening,
  isRecognitionAvailable,
  startListening,
} from '@/voice/recognizer';
import { initialVoiceState, voiceReducer } from '@/voice/session';
import { VOICE_LANGUAGES, isStopCommand, speechLanguageFor, toSpeakable } from '@/voice/speechText';
import { speak, stopSpeaking } from '@/voice/tts';

const RESTART_DELAY_MS = 150;
/** After a "Hey Nova" conversation ends, wait this long before going back. */
const WAKE_CLOSE_DELAY_MS = 1200;

/** Xiaomi may route speech recognition to its own service; ask for Google's. */
const RECOGNIZER_PACKAGE = /xiaomi|redmi|poco/i.test(WakeWord?.getManufacturer() ?? '') ? GOOGLE_RECOGNIZER : undefined;

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Voice conversation with Nova (spec 9.1): one question, or hands-free back-and-forth. */
export default function VoiceScreen() {
  useBindChat();
  // Opened by "Hey Nova" (possibly over the lock screen) rather than the mic button.
  const isWake = useLocalSearchParams<{ wake?: string }>().wake === '1';
  const theme = useTheme();
  const styles = useStyles();
  const settings = useSettingsRepo();

  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const liveTools = useChatStore((s) => s.liveTools);
  const confirm = useChatStore((s) => s.confirm);

  const stateRef = useRef(state);
  const prefsRef = useRef<VoicePrefs | null>(null);
  const listenStartedAt = useRef(0);
  /** The phone was locked when the conversation began: safe tools only, and hide afterwards. */
  const lockedRef = useRef(false);
  const startedRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
    prefsRef.current = prefs;
  });

  function begin(handsFree: boolean) {
    player.duck();
    dispatch({ type: 'START', handsFree });
  }

  function stopAll() {
    cancelListening();
    stopSpeaking();
    if (stateRef.current.phase === 'thinking') useChatStore.getState().stop();
    dispatch({ type: 'STOP' });
  }

  // Set up: load voice settings, check the microphone, start listening.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadVoicePrefs(settings);
      if (cancelled) return;
      setPrefs(loaded);
      prefsRef.current = loaded;
      if (!isRecognitionAvailable()) {
        setFatal('Speech recognition isn’t available on this phone. Install or update the Google app.');
        return;
      }
      if (!(await ensureMicPermission())) {
        if (!cancelled) setFatal('Nova needs microphone permission for voice. Allow it in phone settings.');
        return;
      }
      if (cancelled) return;
      lockedRef.current = isWake && (WakeWord?.isDeviceLocked() ?? false);
      setLocked(lockedRef.current);
      // The wake-word service and speech recognition can't share the microphone.
      if (!isWake) WakeWord?.pauseListening();
      player.duck();
      startedRef.current = true;
      // A "Hey Nova" conversation is hands-free; it ends on "stop" or silence.
      dispatch({ type: 'START', handsFree: isWake || loaded.handsFree });
    })();
    return () => {
      cancelled = true;
      cancelListening();
      stopSpeaking();
      if (stateRef.current.phase === 'thinking') useChatStore.getState().stop();
      player.unduck();
      // Never leave Nova showing over the lock screen, and go back to listening.
      WakeWord?.setShowWhenLocked(false);
      WakeWord?.resumeListening();
    };
  }, [settings, isWake]);

  /** Leaves the voice screen; after a locked "Hey Nova" chat, back behind the lock screen. */
  function leave() {
    if (lockedRef.current) {
      WakeWord?.setShowWhenLocked(false);
      WakeWord?.moveToBack();
    }
    close();
  }

  // A "Hey Nova" conversation closes itself when it ends.
  useEffect(() => {
    if (!isWake || state.phase !== 'idle' || !startedRef.current || fatal) return;
    const timer = setTimeout(leave, WAKE_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isWake, state.phase, fatal]);

  // While locked, the back button ends the conversation instead of revealing the app.
  useEffect(() => {
    if (!isWake) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      stopAll();
      leave();
      return true;
    });
    return () => sub.remove();
  }, [isWake]);

  // Listening: start the microphone each time a new listening round begins.
  useEffect(() => {
    if (state.phase !== 'listening' || !prefsRef.current) return;
    listenStartedAt.current = Date.now();
    startListening(prefsRef.current.language, { servicePackage: RECOGNIZER_PACKAGE });
  }, [state.phase, state.listenId]);

  // Thinking: send what was heard to Nova (same conversation as the chat tab).
  useEffect(() => {
    if (state.phase !== 'thinking') return;
    let cancelled = false;
    useChatStore
      .getState()
      .send(state.heard, { voice: true, locked: lockedRef.current })
      .then((res) => {
        if (cancelled) return;
        const notice = useChatStore.getState().notice?.text;
        if (res.status === 'done' || res.status === 'step_limit' || res.status === 'truncated') {
          dispatch({ type: 'REPLY', text: res.replyText || notice || '' });
        } else if (res.status === 'refusal') {
          dispatch({ type: 'REPLY', text: res.replyText || 'Sorry, I can’t help with that.' });
        } else if (res.status === 'aborted') {
          dispatch({ type: 'STOP' });
        } else {
          dispatch({ type: 'AGENT_FAILED', message: notice ?? 'Nova couldn’t reply. Try again.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.heard]);

  // Speaking: read the reply aloud, in the reply's language.
  useEffect(() => {
    if (state.phase !== 'speaking' || !prefsRef.current) return;
    const p = prefsRef.current;
    speak(toSpeakable(state.reply), {
      language: speechLanguageFor(state.reply, p.language),
      rate: p.rate,
      voiceId: p.voiceId,
    }).then(() => dispatch({ type: 'SPEECH_DONE' }));
  }, [state.phase, state.reply]);

  // Music comes back up whenever the conversation pauses.
  useEffect(() => {
    if (state.phase === 'idle') player.unduck();
  }, [state.phase]);

  useSpeechRecognitionEvent('result', (e) => {
    if (stateRef.current.phase !== 'listening') return;
    const transcript = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      dispatch({ type: 'FINAL', text: transcript });
    } else {
      if (isStopCommand(transcript)) {
        cancelListening();
        dispatch({ type: 'STOP' });
        return;
      }
      dispatch({ type: 'PARTIAL', text: transcript });
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (stateRef.current.phase !== 'listening' || e.error === 'aborted') return;
    if (e.error === 'no-speech' || e.error === 'speech-timeout') {
      // The recogniser gives up after a few seconds; keep listening until 8 s of silence.
      if (Date.now() - listenStartedAt.current < SILENCE_TIMEOUT_MS && prefsRef.current) {
        const language = prefsRef.current.language;
        setTimeout(() => {
          if (stateRef.current.phase === 'listening') startListening(language, { servicePackage: RECOGNIZER_PACKAGE });
        }, RESTART_DELAY_MS);
        return;
      }
      dispatch({ type: 'NO_SPEECH' });
      return;
    }
    dispatch({ type: 'STT_ERROR', message: describeSpeechError(e.error) });
  });

  async function setHandsFree(next: boolean) {
    dispatch({ type: 'SET_HANDS_FREE', handsFree: next });
    await settings.set('voice.handsFree', next ? '1' : '0');
  }

  async function cycleLanguage() {
    if (!prefs) return;
    const i = VOICE_LANGUAGES.findIndex((l) => l.id === prefs.language);
    const next = VOICE_LANGUAGES[(i + 1) % VOICE_LANGUAGES.length].id;
    setPrefs({ ...prefs, language: next });
    await settings.set('voice.language', next);
  }

  function onMainButton() {
    const phase = stateRef.current.phase;
    if (phase === 'idle') begin(state.handsFree);
    else if (phase === 'listening') finishListening();
    else if (phase === 'speaking') stopSpeaking();
    else stopAll();
  }

  const lang = VOICE_LANGUAGES.find((l) => l.id === prefs?.language) ?? VOICE_LANGUAGES[0];
  const working = liveTools.length > 0 ? describeTool(liveTools[liveTools.length - 1].name, {}).label : null;
  const status =
    state.phase === 'listening'
      ? 'Listening'
      : state.phase === 'thinking'
        ? working ?? 'Thinking'
        : state.phase === 'speaking'
          ? 'Speaking'
          : 'Tap the mic to talk';
  const mainIcon = state.phase === 'idle' ? 'mic' : state.phase === 'listening' ? 'check' : 'stop';
  const mainLabel =
    state.phase === 'idle' ? 'Start talking' : state.phase === 'listening' ? 'Done speaking' : state.phase === 'speaking' ? 'Stop speaking' : 'Stop';

  return (
    <Screen bottomInset style={styles.screen}>
      <View style={styles.header}>
        <IconButton icon="chevronDown" label="Close voice" onPress={leave} />
        <AppText variant="bodyStrong" accessibilityRole="header">
          {state.handsFree ? 'Hands-free' : 'Voice'}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Recognition language: ${lang.label}. Tap to change.`}
          onPress={cycleLanguage}
          disabled={state.phase === 'listening'}
          style={styles.langChip}>
          <AppText variant="label" color="textSecondary">
            {lang.short}
          </AppText>
        </Pressable>
      </View>

      {state.heard && state.phase !== 'listening' ? (
        <View style={styles.exchange}>
          <AppText variant="caption" color="textMuted">
            You said
          </AppText>
          <AppText variant="small" color="textSecondary">
            {state.heard}
          </AppText>
          {state.reply ? (
            <>
              <AppText variant="caption" color="textMuted" style={styles.gap}>
                Nova
              </AppText>
              <AppText variant="small" numberOfLines={6}>
                {state.reply}
              </AppText>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.center}>
        <Orb active={state.phase === 'listening' || state.phase === 'speaking'} />
        <AppText variant="overline" color="accent" accessibilityLiveRegion="polite">
          {fatal ? 'Voice unavailable' : status}
        </AppText>
        <AppText variant="heading" style={styles.transcript}>
          {fatal ?? (state.phase === 'listening' ? state.partial || '…' : state.message ?? '')}
        </AppText>
      </View>

      <View style={styles.handsFreeRow}>
        <View style={styles.flex}>
          <AppText variant="bodyMedium">Hands-free</AppText>
          <AppText variant="caption" color="textMuted">
            Keeps listening after each reply. Say “stop” or stay quiet to end.
          </AppText>
        </View>
        <Toggle value={state.handsFree} onChange={setHandsFree} label="Hands-free mode" />
      </View>

      <View style={styles.controls}>
        {locked ? (
          <View style={styles.sideSpacer} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Switch to typing" onPress={leave} style={styles.sideButton}>
            <Icon name="edit" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mainLabel}
          disabled={!!fatal || !prefs}
          onPress={onMainButton}
          style={({ pressed }) => [styles.mainButton, pressed && styles.pressed, (!!fatal || !prefs) && styles.disabled]}>
          <Icon name={mainIcon} size={32} strokeWidth={2} color={theme.colors.onAccent} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End voice conversation"
          onPress={() => {
            stopAll();
            leave();
          }}
          style={[styles.sideButton, styles.endButton]}>
          <Icon name="plus" size={24} strokeWidth={2} color={theme.colors.danger} />
        </Pressable>
      </View>

      {confirm ? (
        <ConfirmSheet
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onAnswer={useChatStore.getState().answerConfirm}
        />
      ) : null}
    </Screen>
  );
}

/** Rings around a pulsing centre while Nova listens or speaks. */
function Orb({ active }: { active: boolean }) {
  const styles = useStyles();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <View style={styles.ringOuter} accessible={false}>
      <View style={styles.ringMiddle}>
        <Animated.View style={[styles.core, { transform: [{ scale }] }]}>
          <View style={styles.coreDot} />
        </Animated.View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { backgroundColor: t.colors.backgroundDeep },
  flex: { flex: 1 },
  header: {
    height: 64,
    paddingHorizontal: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langChip: {
    minWidth: t.touchTarget,
    height: 32,
    paddingHorizontal: t.spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exchange: {
    marginHorizontal: t.spacing.xl,
    padding: 14,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: t.spacing.xs,
  },
  gap: { marginTop: t.spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.xl, paddingHorizontal: t.spacing.xxxl },
  transcript: { textAlign: 'center', minHeight: 60 },
  ringOuter: {
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 1,
    borderColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringMiddle: {
    width: 184,
    height: 184,
    borderRadius: 92,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: t.colors.accentSoft,
    borderWidth: 2,
    borderColor: t.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.accent },
  handsFreeRow: {
    marginHorizontal: t.spacing.xl,
    marginBottom: t.spacing.lg,
    padding: t.spacing.md,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  controls: {
    paddingHorizontal: 36,
    paddingBottom: t.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideSpacer: { width: 56, height: 56 },
  endButton: { backgroundColor: t.colors.dangerSoft, borderColor: t.colors.dangerSoft, transform: [{ rotate: '45deg' }] },
  mainButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: t.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
}));
