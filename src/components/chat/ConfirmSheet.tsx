import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Icon } from '../Icon';

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  onAnswer: (ok: boolean) => void;
};

/** Bottom sheet the AI must pass before anything is deleted (spec 3.1). */
export function ConfirmSheet({ title, message, confirmLabel, onAnswer }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={() => onAnswer(false)} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={() => onAnswer(false)} accessibilityLabel="Cancel" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.xl }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.tile}>
            <Icon name="trash" size={22} color={theme.colors.danger} />
          </View>
          <View style={styles.flex}>
            <AppText variant="heading" accessibilityRole="header">
              {title}
            </AppText>
            <AppText variant="small" color="textMuted">
              Nova is asking
            </AppText>
          </View>
        </View>
        <AppText variant="body" color="textSecondary">
          {message}
        </AppText>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button label="Cancel" variant="secondary" onPress={() => onAnswer(false)} />
          </View>
          <View style={styles.flex}>
            <Button label={confirmLabel} variant="danger" onPress={() => onAnswer(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: t.colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: t.radius.sheet,
    borderTopRightRadius: t.radius.sheet,
    backgroundColor: t.colors.surfaceRaised,
    borderTopWidth: 1,
    borderColor: t.colors.borderStrong,
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.md,
    gap: t.spacing.lg,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.borderStrong },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  tile: {
    width: 44,
    height: 44,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: { flexDirection: 'row', gap: 10 },
}));
