import WakeWord, { isWakeWordAvailable, type ModelProgressEvent, type WakeServiceState } from '@modules/wake-word';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, View } from 'react-native';

import { useSettingsRepo } from '@/db/hooks';
import { makeStyles } from '@/theme';
import { ensureMicPermission } from '@/voice/recognizer';
import { WAKE_SENSITIVITIES, loadWakeSensitivity } from '@/voice/wakePrefs';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Toggle } from '../Toggle';

const MODEL_SIZE = 'about 36 MB';

const STATE_TEXT: Record<WakeServiceState, string> = {
  stopped: 'Off',
  starting: 'Starting…',
  listening: 'Listening',
  paused: 'Answering',
  error: 'Problem',
};

function titleCase(phrase: string) {
  return phrase.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Settings › “Hey Nova”: on/off, speech model, sensitivity, phone setup (spec 9.2, 10.4). */
export function WakeWordSettings() {
  const styles = useStyles();
  const settings = useSettingsRepo();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<WakeServiceState>('stopped');
  const [message, setMessage] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('hey nova');
  const [sensitivity, setSensitivity] = useState(0.5);
  const [download, setDownload] = useState<ModelProgressEvent | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!WakeWord) return;
    setEnabled(WakeWord.isEnabled());
    setState(WakeWord.getState());
    setMessage(WakeWord.getStatusMessage());
    setPhrase(WakeWord.getWakePhrase());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadWakeSensitivity(settings).then(setSensitivity);
    }, [refresh, settings]),
  );

  useEffect(() => {
    if (!WakeWord) return;
    const status = WakeWord.addListener('onStatus', (e) => {
      setState(e.state);
      setMessage(e.message ?? null);
      setPhrase(WakeWord!.getWakePhrase());
    });
    const progress = WakeWord.addListener('onModelProgress', setDownload);
    return () => {
      status.remove();
      progress.remove();
    };
  }, []);

  if (!isWakeWordAvailable) {
    return (
      <AppText variant="caption" color="textMuted">
        Needs the Nova development build with the wake-word module. Rebuild the app to use it.
      </AppText>
    );
  }

  async function confirmDownload(): Promise<boolean> {
    return new Promise((resolve) =>
      Alert.alert(
        'Download speech model?',
        `“Hey Nova” uses an offline speech model (${MODEL_SIZE}) so listening stays on your phone. Download it now? Wi-Fi recommended.`,
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Download', onPress: () => resolve(true) },
        ],
      ),
    );
  }

  async function turnOn() {
    if (!(await ensureMicPermission())) {
      Alert.alert('Microphone needed', 'Allow the microphone so Nova can listen for “Hey Nova”.');
      return;
    }
    if (Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    if (!WakeWord!.isModelReady()) {
      if (!(await confirmDownload())) return;
      await WakeWord!.prepareModelAsync();
      setDownload(null);
    }
    await WakeWord!.startAsync(sensitivity);
  }

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) await turnOn();
      else await WakeWord!.stopAsync();
    } catch (e) {
      setDownload(null);
      Alert.alert('“Hey Nova”', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function chooseSensitivity(value: number) {
    setSensitivity(value);
    await settings.set('wake.sensitivity', String(value));
    if (WakeWord!.isEnabled()) await WakeWord!.startAsync(value);
  }

  const downloading = download && download.stage !== 'ready' && download.stage !== 'error';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText>Listen for “{titleCase(phrase)}”</AppText>
          <AppText variant="caption" color="textMuted">
            {downloading
              ? download.stage === 'downloading'
                ? `Downloading speech model… ${Math.round(download.progress * 100)}%`
                : 'Unpacking speech model…'
              : enabled
                ? `${STATE_TEXT[state]}${message ? ` · ${message}` : ''}`
                : 'Works with the screen locked. Listening stays on the phone.'}
          </AppText>
        </View>
        <Toggle value={enabled} onChange={toggle} label="Listen for Hey Nova" disabled={busy} />
      </View>

      {phrase !== 'hey nova' ? (
        <AppText variant="caption" color="private">
          The speech model doesn’t know the word “Nova”, so the wake phrase is “{titleCase(phrase)}”.
        </AppText>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.group}>
        <AppText>Sensitivity</AppText>
        <AppText variant="caption" color="textMuted">
          Higher wakes more easily, but also by mistake more often.
        </AppText>
        <View style={styles.chips}>
          {WAKE_SENSITIVITIES.map((s) => (
            <Chip key={s.value} label={s.label} selected={sensitivity === s.value} onPress={() => chooseSensitivity(s.value)} />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText>Phone setup</AppText>
          <AppText variant="caption" color="textMuted">
            Battery and lock-screen settings so listening keeps working.
          </AppText>
        </View>
        <Button label="Set up" variant="secondary" compact onPress={() => router.push('/wake-setup')} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  wrap: { gap: t.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  group: { gap: t.spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  divider: { height: 1, backgroundColor: t.colors.border },
}));
