import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Stroke icons from the Nova UI canvas (24×24 grid, round caps). */
const ICONS = {
  sparkles: (
    <>
      <Path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <Path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  note: (
    <>
      <Path d="M7 3h7l5 5v13H7z" />
      <Path d="M14 3v5h5" />
      <Path d="M10 13h6" />
      <Path d="M10 17h4" />
    </>
  ),
  music: (
    <>
      <Path d="M9 18V5l11-2v13" />
      <Circle cx={6} cy={18} r={3} />
      <Circle cx={17} cy={16} r={3} />
    </>
  ),
  folder: <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  settings: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  mic: (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0" />
      <Path d="M12 18v3" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-4-4" />
    </>
  ),
  lock: (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  eye: (
    <>
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  check: <Path d="M5 12l5 5 9-10" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  trash: (
    <>
      <Path d="M4 7h16" />
      <Path d="M9 7V4h6v3" />
      <Path d="M6 7l1 13h10l1-13" />
    </>
  ),
  share: (
    <>
      <Path d="M12 3v12" />
      <Path d="M7 8l5-5 5 5" />
      <Path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  key: (
    <>
      <Circle cx={8} cy={15} r={4} />
      <Path d="M10.8 12.2L20 3" />
      <Path d="M17 6l3 3" />
    </>
  ),
  edit: (
    <>
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  refresh: (
    <>
      <Path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <Path d="M4 3v5h5" />
      <Path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <Path d="M20 21v-5h-5" />
    </>
  ),
  chevronDown: <Path d="M6 9l6 6 6-6" />,
  shuffle: (
    <>
      <Path d="M16 3h5v5" />
      <Path d="M4 20L21 3" />
      <Path d="M21 16v5h-5" />
      <Path d="M15 15l6 6" />
      <Path d="M4 4l5 5" />
    </>
  ),
  repeat: (
    <>
      <Path d="M17 2l4 4-4 4" />
      <Path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <Path d="M7 22l-4-4 4-4" />
      <Path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  import: (
    <>
      <Path d="M12 3v12" />
      <Path d="M7 10l5 5 5-5" />
      <Path d="M5 21h14" />
    </>
  ),
  // Filled glyphs: drawn with the icon color via currentColor.
  play: <Path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <Rect x={6} y={4} width={4} height={16} rx={1} fill="currentColor" stroke="none" />
      <Rect x={14} y={4} width={4} height={16} rx={1} fill="currentColor" stroke="none" />
    </>
  ),
  next: (
    <>
      <Path d="M6 5v14l10-7z" fill="currentColor" stroke="none" />
      <Rect x={16.5} y={5} width={2.5} height={14} rx={1} fill="currentColor" stroke="none" />
    </>
  ),
  previous: (
    <>
      <Path d="M18 5v14L8 12z" fill="currentColor" stroke="none" />
      <Rect x={5} y={5} width={2.5} height={14} rx={1} fill="currentColor" stroke="none" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
};

export function Icon({ name, color, size = 22, strokeWidth = 1.8 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      color={color}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}>
      {ICONS[name]}
    </Svg>
  );
}
