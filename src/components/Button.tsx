import { ActivityIndicator, Pressable } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
};

export function Button({ label, onPress, variant = 'primary', disabled, busy, compact }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const fg =
    variant === 'primary'
      ? theme.colors.onAccent
      : variant === 'danger'
        ? theme.colors.onDanger
        : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <AppText variant="label" style={{ color: fg }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    height: 48,
    paddingHorizontal: t.spacing.xl,
    borderRadius: t.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { height: 36, paddingHorizontal: t.spacing.lg, borderRadius: t.radius.pill },
  primary: { backgroundColor: t.colors.accentStrong },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
  },
  danger: { backgroundColor: t.colors.dangerStrong },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
}));
