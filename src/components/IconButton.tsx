import { Pressable } from 'react-native';

import { makeStyles, useTheme, type ColorRole } from '@/theme';

import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  /** Read by screen readers; icon-only buttons must always have one. */
  label: string;
  onPress: () => void;
  color?: ColorRole;
  size?: number;
  disabled?: boolean;
};

export function IconButton({ icon, label, onPress, color = 'textSecondary', size = 22, disabled }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name={icon} size={size} color={theme.colors[color]} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  button: {
    width: t.touchTarget,
    height: t.touchTarget,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: t.colors.surface },
  disabled: { opacity: 0.4 },
}));
