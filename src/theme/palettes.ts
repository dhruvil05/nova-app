/**
 * Color palettes. This is the ONLY place in the app where color values live.
 * Components read colors by role (theme.colors.surface, theme.colors.accent…)
 * so a new theme is just a new palette object with the same keys.
 */

export type ColorTokens = {
  /** App background behind every screen */
  background: string;
  /** Darker background for immersive screens (voice, lock) */
  backgroundDeep: string;
  /** Cards, inputs, list rows */
  surface: string;
  /** Slightly lifted surface: chat bubbles, sheets */
  surfaceRaised: string;
  /** Recessed areas inside a surface */
  surfaceSunken: string;
  tabBar: string;
  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  placeholder: string;

  /** Accent for text and icons on dark surfaces */
  accent: string;
  /** Filled accent: primary buttons, mic button, switches */
  accentStrong: string;
  onAccent: string;
  /** Tinted accent background: AI badges, active tab pill */
  accentSoft: string;
  accentSoftText: string;

  /** Private notes: everything hidden from the AI uses this family */
  private: string;
  privateSoft: string;
  privateSurface: string;
  privateBorder: string;
  privateText: string;
  onPrivate: string;

  danger: string;
  dangerStrong: string;
  dangerSoft: string;
  onDanger: string;
  success: string;

  /** "YOU" badge and other neutral chips */
  neutralBadge: string;
  neutralBadgeText: string;
  chipSelected: string;
  onChipSelected: string;

  switchTrackOff: string;
  switchThumbOff: string;
  switchThumbOn: string;
  scrim: string;

  /** Placeholder album-art colors; each song picks one from its album/artist name. */
  artwork: { background: string; foreground: string }[];

  /** File-type tiles in the Files tab */
  fileTypes: Record<'pdf' | 'docx' | 'txt' | 'other', { background: string; foreground: string }>;
};

/** Names of the single-color tokens (everything except lists like `artwork`). */
export type ColorRole = {
  [K in keyof ColorTokens]: ColorTokens[K] extends string ? K : never;
}[keyof ColorTokens];

/** Default theme: dark with violet accent, matching the UI canvas. */
export const novaDark: ColorTokens = {
  background: '#0D0D12',
  backgroundDeep: '#0A0A0F',
  surface: '#15151C',
  surfaceRaised: '#17171F',
  surfaceSunken: '#0F0F15',
  tabBar: '#111117',
  border: '#22222C',
  borderStrong: '#2E2E3A',

  text: '#F2F1F7',
  textSecondary: '#B9B8C6',
  textMuted: '#9A99A8',
  textFaint: '#8E8D9C',
  placeholder: '#7A7988',

  accent: '#A08BFF',
  accentStrong: '#6D4AF2',
  onAccent: '#FFFFFF',
  accentSoft: '#231D3A',
  accentSoftText: '#B7A6FF',

  private: '#F2B248',
  privateSoft: '#2E2414',
  privateSurface: '#17140E',
  privateBorder: '#3A2F18',
  privateText: '#B9A98A',
  onPrivate: '#1E1608',

  danger: '#FF8A8A',
  dangerStrong: '#C8323A',
  dangerSoft: '#3A1A1D',
  onDanger: '#FFFFFF',
  success: '#8FE0B0',

  neutralBadge: '#26262F',
  neutralBadgeText: '#C9C8D4',
  chipSelected: '#F2F1F7',
  onChipSelected: '#0D0D12',

  switchTrackOff: '#33323F',
  switchThumbOff: '#B9B8C6',
  switchThumbOn: '#FFFFFF',
  scrim: 'rgba(4, 4, 8, 0.72)',

  artwork: [
    { background: '#C2562F', foreground: '#FFE9DE' },
    { background: '#2F5FA8', foreground: '#DCE8FF' },
    { background: '#2B8366', foreground: '#DDF7EC' },
    { background: '#7A3FB0', foreground: '#F1E3FF' },
    { background: '#A8842B', foreground: '#FFF4D9' },
    { background: '#3A3F4C', foreground: '#D6DAE3' },
  ],

  fileTypes: {
    pdf: { background: '#3A1A1D', foreground: '#FF9A9A' },
    docx: { background: '#14233A', foreground: '#8AB8FF' },
    txt: { background: '#1E2A22', foreground: '#8FE0B0' },
    other: { background: '#26262F', foreground: '#C9C8D4' },
  },
};
