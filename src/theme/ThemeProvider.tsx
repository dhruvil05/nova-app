import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { defaultThemeName, themes, type Theme, type ThemeName } from './theme';

const ThemeContext = createContext<Theme>(themes[defaultThemeName]);

type Props = {
  /** Which theme to use. Later this can come from Settings. */
  name?: ThemeName;
  children: ReactNode;
};

export function ThemeProvider({ name = defaultThemeName, children }: Props) {
  return <ThemeContext.Provider value={themes[name]}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds a hook that returns styles for the current theme.
 *
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
