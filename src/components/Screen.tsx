import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme';

type Props = {
  children: ReactNode;
  /** Add the bottom safe-area inset (screens without the tab bar). */
  bottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Full-screen container with the theme background and the top safe-area inset. */
export function Screen({ children, bottomInset, style }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: bottomInset ? insets.bottom : 0 },
        style,
      ]}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.background },
}));
