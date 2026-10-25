import WakeWord, { isWakeWordAvailable, type ModelProgressEvent, type WakeServiceState } from '@modules/wake-word';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, View } from 'react-native';

import { useSettingsRepo } from '@/db/hooks';
import { makeStyles } from '@/theme';
import { confirmAction, showMessage } from '@/utils/dialog';
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

/** Settings › “Hey Nova”: on/off, speech model, sensitivity, phone setup (spec 9.2, 10.4). */
export function WakeWordSettings() {
  const styles = useStyles();
  const settings = useSettingsRepo();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<WakeServiceState>('stopped');
  const [message, setMessage] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [download, setDownload] = useState<ModelProgressEvent | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!WakeWord) return;
    setEnabled(WakeWord.isEnabled());
    setState(WakeWord.getState());
    setMessage(WakeWord.getStatusMessage());
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

  function confirmDownload(): Promise<boolean> {
    return confirmAction({
      title: 'Download speech model?',
      message: `“Hey Nova” uses an offline speech model (${MODEL_SIZE}) so listening stays on your phone. Download it now? Wi-Fi recommended.`,
      confirmLabel: 'Download',
      cancelLabel: 'Not now',
    });
  }

  async function turnOn() {
    if (!(await ensureMicPermission())) {
      showMessage('Microphone needed', 'Allow the microphone so Nova can listen for “Hey Nova”.');
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
      showMessage('“Hey Nova”', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function chooseSensitivity(value: number) {
    setSensitivity(value);
    try {
      await settings.set('wake.sensitivity', String(value));
      if (WakeWord!.isEnabled()) await WakeWord!.startAsync(value);
    } catch (e) {
      showMessage('“Hey Nova”', e instanceof Error ? e.message : 'Couldn’t change the sensitivity.');
    }
  }

  const downloading = download && download.stage !== 'ready' && download.stage !== 'error';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText>Listen for “Hey Nova”</AppText>
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

      <AppText variant="caption" color="textMuted">
        If Nova doesn’t wake to “Hey Nova”, say “Hey Computer”: the offline speech model may not know the word “Nova”.
      </AppText>

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
