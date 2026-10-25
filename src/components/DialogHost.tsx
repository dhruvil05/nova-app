import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { makeStyles } from '@/theme';
import { useDialogs, type Dialog, type DialogButton } from '@/utils/dialog';

import { AppText } from './AppText';

/** Shows the dialogs queued through src/utils/dialog.ts, one at a time. */
export function DialogHost() {
  const dialog = useDialogs((s) => s.queue[0]);
  if (!dialog) return null;
  return <DialogView key={dialog.id} dialog={dialog} />;
}

function DialogView({ dialog }: { dialog: Dialog }) {
  const styles = useStyles();
  const close = useDialogs((s) => s.close);
  const cancel = dialog.buttons.find((b) => b.style === 'cancel');
  // Two buttons sit side by side; menus stack vertically.
  const stacked = dialog.buttons.length > 2;

  function press(button: DialogButton | undefined) {
    close(dialog.id);
    button?.onPress?.();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => press(cancel)} statusBarTranslucent>
      <View style={styles.center}>
        <Pressable style={styles.scrim} onPress={() => press(cancel)} accessibilityLabel="Close dialog" />
        <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
          <AppText variant="heading" accessibilityRole="header">
            {dialog.title}
          </AppText>
          {dialog.message ? (
            <AppText variant="body" color="textSecondary">
              {dialog.message}
            </AppText>
          ) : null}
          <View style={stacked ? styles.stack : styles.row}>
            {dialog.buttons.map((b, i) => (
              <Pressable
                key={`${b.label}-${i}`}
                accessibilityRole="button"
                onPress={() => press(b)}
                style={({ pressed }) => [
                  styles.button,
                  !stacked && styles.rowButton,
                  b.style === 'destructive' && styles.destructive,
                  b.style === 'default' && !stacked && styles.primary,
                  pressed && styles.pressed,
                ]}>
                <AppText
                  variant="label"
                  color={b.style === 'destructive' ? 'onDanger' : b.style === 'default' && !stacked ? 'onAccent' : 'text'}>
                  {b.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, justifyContent: 'center', padding: t.spacing.xxl },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: t.colors.scrim },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    borderRadius: t.radius.sheet,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    padding: t.spacing.xl,
    gap: t.spacing.md,
  },
  row: { flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.xs },
  stack: { gap: t.spacing.sm, marginTop: t.spacing.xs },
  button: {
    minHeight: t.touchTarget,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.lg,
  },
  rowButton: { flex: 1 },
  primary: { backgroundColor: t.colors.accentStrong, borderColor: t.colors.accentStrong },
  destructive: { backgroundColor: t.colors.dangerStrong, borderColor: t.colors.dangerStrong },
  pressed: { opacity: 0.8 },
}));
