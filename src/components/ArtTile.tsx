import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  /** Album, or artist, or title: songs from the same album share a color. */
  seed: string;
  /** Two-letter initials shown on the tile; omit to show a music note. */
  label?: string;
  size?: number;
};

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** "Channa Mereya" -> "CM". Skips leading punctuation such as "(" or "'". */
export function initials(title: string): string {
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/^[\s!-/:-@[-`{-~]+/, ''))
    .filter(Boolean)
    .map((w) => Array.from(w));
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).join('').toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Placeholder album art (real cover art can replace this later). */
export function ArtTile({ seed, label, size = 48 }: Props) {
  const theme = useTheme();
  const { background, foreground } = theme.colors.artwork[hash(seed) % theme.colors.artwork.length];
  const radius = Math.round(size * 0.21);

  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {label ? (
        <AppText
          style={{
            color: foreground,
            fontFamily: theme.fonts.displayBold,
            fontSize: Math.round(size / 3),
          }}>
          {label}
        </AppText>
      ) : (
        <Icon name="music" size={Math.round(size * 0.42)} color={foreground} />
      )}
    </View>
  );
}
