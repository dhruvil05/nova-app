import WakeWord, { isWakeWordAvailable } from '@modules/wake-word';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { makeStyles, useTheme } from '@/theme';
import { ensureMicPermission } from '@/voice/recognizer';

/** Android API level (Platform.Version is a number on Android). */
const API_LEVEL = Number(Platform.Version);

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

type Checks = {
  mic: boolean;
  notifications: boolean;
  battery: boolean;
  overlay: boolean;
};

async function readChecks(): Promise<Checks> {
  const mic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const notifications =
    API_LEVEL < 33 || (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS));
  return {
    mic,
    notifications,
    battery: WakeWord?.isIgnoringBatteryOptimizations() ?? false,
    overlay: WakeWord?.canDrawOverlays() ?? false,
  };
}

/**
 * Phone settings "Hey Nova" needs to keep listening with the screen off (spec 9.3).
 * Xiaomi (Redmi/POCO) phones close background apps aggressively, so they get
 * extra steps; dontkillmyapp.com lists the same steps for other brands.
 */
export default function WakeSetupScreen() {
  const styles = useStyles();
  const [checks, setChecks] = useState<Checks | null>(null);
  const isXiaomi = /xiaomi|redmi|poco/i.test(WakeWord?.getManufacturer() ?? '');

  const refresh = useCallback(() => {
    // Without the native module (Expo Go, web) there is nothing to check.
    if (!isWakeWordAvailable) return;
    readChecks()
      .then(setChecks)
      .catch(() => {});
  }, []);

  // Re-check whenever the user comes back from a settings screen.
  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
      return () => sub.remove();
    }, [refresh]),
  );

  async function allowMicAndNotifications() {
    await ensureMicPermission();
    if (API_LEVEL >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    refresh();
  }

  if (!isWakeWordAvailable) {
    return (
      <Screen bottomInset>
        <Header />
        <AppText color="textMuted" style={styles.pad}>
          The wake word needs the Nova development build (Phase 6). Rebuild the app and open this again.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen bottomInset>
      <Header />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText color="textSecondary">
          {isXiaomi
            ? 'Xiaomi phones close apps in the background to save battery. Do each step once so “Hey Nova” keeps working with the screen off.'
            : 'Do each step once so “Hey Nova” keeps working with the screen off.'}
        </AppText>

        <Step
          n={1}
          title="Microphone and notifications"
          body="Nova listens on the phone only. Nothing is sent anywhere until you say “Hey Nova”. A notification shows while it listens."
          done={checks ? checks.mic && checks.notifications : undefined}
          action={{ label: 'Allow', onPress: allowMicAndNotifications }}
        />
        <Step
          n={2}
          title="Ignore battery optimisation"
          body="Lets Android keep Nova’s listening service running."
          done={checks?.battery}
          action={{ label: 'Open', onPress: () => WakeWord!.openBatteryOptimizationRequest() }}
        />
        <Step
          n={3}
          title="Display over other apps"
          body="Lets Nova open its voice screen when you say “Hey Nova” while the phone is locked or another app is open."
          done={checks?.overlay}
          action={{ label: 'Open', onPress: () => WakeWord!.openOverlaySettings() }}
        />
        {isXiaomi ? (
          <>
            <Step
              n={4}
              title="Autostart"
              body="Turn Nova ON so it can start listening again after a restart."
              action={{ label: 'Open', onPress: () => WakeWord!.openXiaomiAutostart() || WakeWord!.openAppDetails() }}
            />
            <Step
              n={5}
              title="Show on lock screen and pop-ups"
              body="In Other permissions, set “Show on Lock screen” and “Display pop-up windows while running in the background” to Allow."
              action={{ label: 'Open', onPress: () => WakeWord!.openXiaomiPermissions() || WakeWord!.openAppDetails() }}
            />
            <Step
              n={6}
              title="Battery saver: No restrictions"
              body="App info › Battery saver › No restrictions."
              action={{ label: 'Open', onPress: () => WakeWord!.openAppDetails() }}
            />
            <Step
              n={7}
              title="Lock Nova in Recents"
              body="Open the recent-apps screen, long-press Nova’s card and tap the lock icon. This stops “Clear all” from closing it."
            />
          </>
        ) : (
          <Step
            n={4}
            title="Battery: Unrestricted"
            body="App info › Battery › Unrestricted. Some brands also have an Autostart switch; see dontkillmyapp.com for your phone."
            action={{ label: 'Open', onPress: () => WakeWord!.openAppDetails() }}
          />
        )}

        <AppText variant="caption" color="textMuted">
          Ticks show the settings Nova can check itself. Xiaomi’s own switches can’t be read by apps, so set those by hand.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function Header() {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <IconButton icon="back" label="Back" onPress={goBack} />
      <AppText variant="heading" accessibilityRole="header">
        Set up “Hey Nova”
      </AppText>
    </View>
  );
}

function Step(props: {
  n: number;
  title: string;
  body: string;
  done?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.step, props.done && styles.stepDone]}>
      <View style={[styles.badge, props.done && styles.badgeDone]}>
        {props.done ? (
          <Icon name="check" size={16} strokeWidth={2.4} color={theme.colors.onAccent} />
        ) : (
          <AppText variant="label" color="textSecondary">
            {props.n}
          </AppText>
        )}
      </View>
      <View style={styles.stepText}>
        <AppText variant="bodyMedium">{props.title}</AppText>
        <AppText variant="small" color="textMuted">
          {props.body}
        </AppText>
        {props.action && !props.done ? (
          <View style={styles.stepAction}>
            <Button label={props.action.label} variant="secondary" compact onPress={props.action.onPress} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pad: { padding: t.spacing.xl },
  header: { height: 64, paddingHorizontal: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  content: { padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: t.spacing.xxxl },
  step: {
    flexDirection: 'row',
    gap: t.spacing.md,
    padding: t.spacing.lg,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  stepDone: { borderColor: t.colors.accentSoft },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDone: { backgroundColor: t.colors.accentStrong, borderColor: t.colors.accentStrong },
  stepText: { flex: 1, gap: t.spacing.xs },
  stepAction: { alignSelf: 'flex-start', marginTop: t.spacing.xs },
}));
