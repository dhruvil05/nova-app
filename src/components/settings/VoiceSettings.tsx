import type { Voice } from 'expo-speech';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useSettingsRepo } from '@/db/hooks';
import { makeStyles } from '@/theme';
import { SPEECH_RATES, loadVoicePrefs, type VoicePrefs } from '@/voice/prefs';
import { VOICE_LANGUAGES, type VoiceLanguage } from '@/voice/speechText';
import { speak, stopSpeaking, voicesFor } from '@/voice/tts';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Chip } from '../Chip';

const SAMPLES: Record<VoiceLanguage, string> = {
  'en-IN': 'Hi, I’m Nova. I can take notes, play your music and read your files.',
  'hi-IN': 'नमस्ते, मैं नोवा हूँ। मैं नोट्स बना सकती हूँ और आपका संगीत चला सकती हूँ।',
  'gu-IN': 'નમસ્તે, હું નોવા છું. હું નોંધ બનાવી શકું છું અને તમારું સંગીત વગાડી શકું છું.',
};

const MAX_VOICES_SHOWN = 6;

/** Settings › Voice: recognition language, speaking speed and Nova's voice (spec 10.4). */
export function VoiceSettings() {
  const styles = useStyles();
  const settings = useSettingsRepo();
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadVoicePrefs(settings).then(setPrefs);
  }, [settings]);

  const language = prefs?.language;
  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    voicesFor(language).then((v) => {
      if (!cancelled) setVoices(v.slice(0, MAX_VOICES_SHOWN));
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  if (!prefs) return null;

  async function update(next: Partial<VoicePrefs>) {
    // A voice belongs to one language, so changing language goes back to automatic.
    const languageChanged = next.language !== undefined && next.language !== prefs!.language;
    setPrefs({ ...prefs!, ...next, ...(languageChanged ? { voiceId: null } : {}) });
    if (next.language !== undefined) {
      await settings.set('voice.language', next.language);
      if (languageChanged) await settings.remove('voice.ttsVoice');
    }
    if (next.rate !== undefined) await settings.set('voice.rate', String(next.rate));
    if (next.voiceId !== undefined) {
      if (next.voiceId) await settings.set('voice.ttsVoice', next.voiceId);
      else await settings.remove('voice.ttsVoice');
    }
  }

  async function test() {
    if (testing) {
      await stopSpeaking();
      return;
    }
    setTesting(true);
    await speak(SAMPLES[prefs!.language], { language: prefs!.language, rate: prefs!.rate, voiceId: prefs!.voiceId });
    setTesting(false);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.group}>
        <AppText>Language</AppText>
        <AppText variant="caption" color="textMuted">
          What you speak. Nova replies in the language you use.
        </AppText>
        <View accessibilityRole="radiogroup" style={styles.options}>
          {VOICE_LANGUAGES.map((l) => (
            <RadioRow key={l.id} label={l.label} selected={l.id === prefs.language} onPress={() => update({ language: l.id })} />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.group}>
        <AppText>Speaking speed</AppText>
        <View style={styles.chips}>
          {SPEECH_RATES.map((r) => (
            <Chip key={r.value} label={r.label} selected={prefs.rate === r.value} onPress={() => update({ rate: r.value })} />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.group}>
        <AppText>Nova’s voice</AppText>
        {voices.length === 0 ? (
          <AppText variant="caption" color="textMuted">
            No voice for this language is installed. Add one in phone Settings › Text-to-speech › Google › Install voice data.
          </AppText>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.options}>
            <RadioRow label="Automatic" detail="Best installed voice" selected={!prefs.voiceId} onPress={() => update({ voiceId: null })} />
            {voices.map((v, i) => (
              <RadioRow
                key={v.identifier}
                label={`Voice ${i + 1}`}
                detail={`${v.language}${v.quality === 'Enhanced' ? ' · enhanced' : ''}`}
                selected={prefs.voiceId === v.identifier}
                onPress={() => update({ voiceId: v.identifier })}
              />
            ))}
          </View>
        )}
        <Button label={testing ? 'Stop' : 'Test voice'} variant="secondary" compact onPress={test} />
      </View>
    </View>
  );
}

function RadioRow({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.flex}>
        <AppText variant="bodyMedium">{label}</AppText>
        {detail ? (
          <AppText variant="caption" color="textMuted">
            {detail}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  wrap: { gap: t.spacing.md },
  group: { gap: t.spacing.sm, alignItems: 'stretch' },
  divider: { height: 1, backgroundColor: t.colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  options: { gap: t.spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  optionSelected: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: t.colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.accent },
}));
