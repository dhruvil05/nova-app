import { useActiveMediaItem, useIsPlaying, useProgress } from '@rntp/player';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import * as player from '@/services/player';
import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { ArtTile, initials } from './ArtTile';
import { Icon } from './Icon';

/** Now-playing strip above the tab bar. Hidden when nothing is loaded. */
export function MiniPlayer() {
  const theme = useTheme();
  const styles = useStyles();
  const item = useActiveMediaItem();
  const playing = useIsPlaying();
  const { position, duration } = useProgress(1);

  if (!item) return null;

  const title = item.title ?? 'Unknown song';
  const fraction = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Now playing: ${title}${item.artist ? ` by ${item.artist}` : ''}. Opens the player.`}
      onPress={() => router.push('/player')}
      style={styles.bar}>
      <ArtTile seed={item.albumTitle ?? item.artist ?? title} label={initials(title)} size={40} />
      <View style={styles.text}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {item.artist ?? 'Unknown artist'}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        onPress={player.togglePlay}
        hitSlop={4}
        style={styles.control}>
        <Icon name={playing ? 'pause' : 'play'} size={22} color={theme.colors.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next song"
        onPress={player.next}
        hitSlop={4}
        style={styles.control}>
        <Icon name="next" size={20} color={theme.colors.text} />
      </Pressable>
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    marginHorizontal: t.spacing.sm,
    marginBottom: t.spacing.sm,
    height: 60,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingLeft: t.spacing.sm,
    paddingRight: t.spacing.xs,
    overflow: 'hidden',
  },
  text: { flex: 1, minWidth: 0 },
  control: {
    width: t.touchTarget,
    height: t.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  progressFill: { height: 2, backgroundColor: t.colors.accent },
}));
