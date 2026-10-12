import { Text, type TextProps } from 'react-native';

import { useTheme, type ColorRole } from '@/theme';
import type { typography } from '@/theme/theme';

type Props = TextProps & {
  variant?: keyof typeof typography;
  color?: ColorRole;
};

/** Text that always uses a theme type style and a theme color role. */
export function AppText({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const theme = useTheme();
  return (
    <Text style={[theme.typography[variant], { color: theme.colors[color] }, style]} {...rest} />
  );
}
