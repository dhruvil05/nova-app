import WakeWord from '@modules/wake-word';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useSettingsRepo } from '@/db/hooks';
import { makeStyles, useTheme } from '@/theme';
import { loadWakeSensitivity } from '@/voice/wakePrefs';

/**
 * Opened from the "Tap to start listening again" notification (after a reboot, or
 * when Android stopped the service). Android only lets the microphone service
 * start while Nova is on screen, which it is now.
 */
export default function WakeResumeScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const settings = useSettingsRepo();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!WakeWord) throw new Error('The wake word isn’t available in this build.');
        await WakeWord.startAsync(await loadWakeSensitivity(settings));
        if (!cancelled) router.replace('/');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Couldn’t start listening.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  return (
    <Screen bottomInset>
      <View style={styles.center}>
        {error ? (
          <>
            <AppText variant="heading">“Hey Nova” didn’t start</AppText>
            <AppText color="textMuted" style={styles.text}>
              {error}
            </AppText>
            <Button label="Open settings" onPress={() => router.replace('/settings')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.colors.accent} />
            <AppText color="textMuted">Turning “Hey Nova” back on…</AppText>
          </>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl },
  text: { textAlign: 'center' },
}));
