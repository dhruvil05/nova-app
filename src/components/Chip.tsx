import { Pressable } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  tone?: 'default' | 'private';
};

/** Filter chip (All / Public / Private). */
export function Chip({ label, selected, onPress, icon, tone = 'default' }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const isPrivate = tone === 'private';

  const fg = selected
    ? isPrivate
      ? theme.colors.onPrivate
      : theme.colors.onChipSelected
    : isPrivate
      ? theme.colors.private
      : theme.colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        isPrivate && styles.privateChip,
        selected && (isPrivate ? styles.privateSelected : styles.selected),
      ]}>
      {icon ? <Icon name={icon} size={14} strokeWidth={2} color={fg} /> : null}
      <AppText variant="label" style={{ color: fg }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  chip: {
    height: 36,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selected: { backgroundColor: t.colors.chipSelected, borderColor: t.colors.chipSelected },
  privateChip: { borderColor: t.colors.privateBorder },
  privateSelected: { backgroundColor: t.colors.private, borderColor: t.colors.private },
}));
