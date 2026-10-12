import type { TextStyle } from 'react-native';

import { novaDark, type ColorTokens } from './palettes';

/**
 * Font family names. They must match the keys passed to useFonts() in the root layout.
 * With custom fonts on Android, pick a weight by family name instead of setting fontWeight.
 */
export const fonts = {
  displayLight: 'Sora_300Light',
  display: 'Sora_500Medium',
  displayBold: 'Sora_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  sheet: 28,
  pill: 999,
} as const;

/** Minimum touch target size */
export const touchTarget = 44;

export const typography = {
  title: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.displayBold, fontSize: 20, lineHeight: 26 },
  noteTitle: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 32 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
  },
  badge: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.44 },
} satisfies Record<string, TextStyle>;

export type Theme = {
  name: string;
  /** Tells the status bar and system UI which way to render */
  isDark: boolean;
  colors: ColorTokens;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  touchTarget: number;
};

function buildTheme(name: string, isDark: boolean, colors: ColorTokens): Theme {
  return { name, isDark, colors, fonts, spacing, radius, typography, touchTarget };
}

/** All available themes. Add a new palette here to offer another theme. */
export const themes = {
  novaDark: buildTheme('novaDark', true, novaDark),
} as const;

export type ThemeName = keyof typeof themes;

export const defaultThemeName: ThemeName = 'novaDark';
