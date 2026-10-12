import { Pressable, View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from './AppText';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
};

/** Segmented switch (Songs / Artists / Albums). */
export function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.option, selected && styles.selected]}>
            <AppText variant="label" color={selected ? 'onAccent' : 'textMuted'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    flexDirection: 'row',
    gap: t.spacing.xs,
    padding: t.spacing.xs,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
  },
  option: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: t.colors.accentSoft },
}));
