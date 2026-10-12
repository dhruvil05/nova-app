import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

type Props = {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** On/off switch drawn with theme colors (the native Switch can't match the design). */
export function Toggle({ value, onChange, label, disabled }: Props) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={6}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, disabled && styles.disabled]}>
      <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    flexDirection: 'row',
  },
  trackOn: { backgroundColor: t.colors.accentStrong, justifyContent: 'flex-end' },
  trackOff: { backgroundColor: t.colors.switchTrackOff, justifyContent: 'flex-start' },
  thumb: { width: 26, height: 26, borderRadius: 13 },
  thumbOn: { backgroundColor: t.colors.switchThumbOn },
  thumbOff: { backgroundColor: t.colors.switchThumbOff },
  disabled: { opacity: 0.5 },
}));
