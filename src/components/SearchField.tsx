import { TextInput, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './Icon';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
};

export function SearchField({ value, onChangeText, placeholder }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.icon} pointerEvents="none">
        <Icon name="search" size={18} color={theme.colors.textMuted} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={styles.input}
        selectionColor={theme.colors.accent}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { justifyContent: 'center' },
  icon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    height: 44,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface,
    color: t.colors.text,
    paddingLeft: 42,
    paddingRight: 14,
    ...t.typography.body,
  },
}));
