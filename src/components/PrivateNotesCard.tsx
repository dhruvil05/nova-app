import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Locked placeholder that stands in for private notes until the user unlocks. */
export function PrivateNotesCard({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count} private ${count === 1 ? 'note' : 'notes'}. Unlock with fingerprint.`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.tile}>
        <Icon name="lock" size={18} color={theme.colors.private} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong">
          {count} private {count === 1 ? 'note' : 'notes'}
        </AppText>
        <AppText variant="small" color="privateText">
          Hidden from Nova. Unlock with fingerprint.
        </AppText>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: 14,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.privateSurface,
    borderWidth: 1,
    borderColor: t.colors.privateBorder,
  },
  pressed: { opacity: 0.8 },
  tile: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.privateSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
}));
