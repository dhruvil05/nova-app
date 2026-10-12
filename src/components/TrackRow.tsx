import { Pressable, View } from 'react-native';

import type { Track } from '@/db/tracksRepo';
import { makeStyles } from '@/theme';
import { formatDuration } from '@/utils/trackName';

import { AppText } from './AppText';
import { ArtTile, initials } from './ArtTile';

type Props = {
  track: Track;
  /** The song currently loaded in the player */
  isCurrent?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

export function TrackRow({ track, isCurrent, onPress, onLongPress }: Props) {
  const styles = useStyles();
  const subtitle = [track.artist ?? 'Unknown artist', formatDuration(track.durationMs)].join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist ?? 'unknown artist'}${isCurrent ? ', now playing' : ''}`}
      accessibilityHint="Plays this song"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, isCurrent && styles.current, pressed && styles.pressed]}>
      <ArtTile seed={track.album ?? track.artist ?? track.title} label={initials(track.title)} />
      <View style={styles.text}>
        <AppText
          variant={isCurrent ? 'bodyStrong' : 'bodyMedium'}
          color={isCurrent ? 'accentSoftText' : 'text'}
          numberOfLines={1}>
          {track.title}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      {track.source === 'imported' ? (
        <View style={styles.tag}>
          <AppText variant="badge" color="neutralBadgeText">
            IMPORTED
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.lg,
  },
  current: { backgroundColor: t.colors.surfaceRaised },
  pressed: { backgroundColor: t.colors.surface },
  text: { flex: 1, minWidth: 0, gap: 2 },
  tag: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.neutralBadge,
  },
}));
