import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { ArtTile, initials } from '@/components/ArtTile';
import { EmptyState } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { SeekBar } from '@/components/SeekBar';
import * as player from '@/services/player';
import { useActiveMediaItem, useIsPlaying, useProgress } from '@/services/player';
import { makeStyles, useTheme } from '@/theme';
import { formatDuration } from '@/utils/trackName';

const UP_NEXT_COUNT = 3;

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/music');
}

export default function PlayerScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const item = useActiveMediaItem();
  const playing = useIsPlaying();
  const { position, duration } = useProgress(0.5);

  // Shuffle/repeat live in the native player; mirror them so the buttons update.
  const [shuffle, setShuffle] = useState(player.isShuffleEnabled());
  const [repeat, setRepeat] = useState(player.getRepeatMode());

  // The queue lives natively; re-read it whenever the playing song changes.
  const { items: queue, activeIndex } = useMemo(
    () => (item ? player.getQueue() : { items: [], activeIndex: null }),
    [item],
  );

  if (!item) {
    return (
      <Screen bottomInset>
        <View style={styles.header}>
          <IconButton icon="chevronDown" label="Close player" onPress={close} />
        </View>
        <EmptyState icon="music" title="Nothing playing" body="Pick a song in the Music tab." />
      </Screen>
    );
  }

  const title = item.title ?? 'Unknown song';
  const upNext =
    !shuffle && activeIndex !== null
      ? queue.slice(activeIndex + 1, activeIndex + 1 + UP_NEXT_COUNT).map((q, i) => ({ q, index: activeIndex + 1 + i }))
      : [];
  const remaining = activeIndex !== null ? queue.length - activeIndex - 1 : 0;

  return (
    <Screen bottomInset>
      <View style={styles.header}>
        <IconButton icon="chevronDown" label="Close player" onPress={close} />
        <View style={styles.headerText}>
          <AppText variant="overline" color="textMuted">
            Now playing
          </AppText>
          <AppText variant="label" numberOfLines={1}>
            {activeIndex !== null ? `${activeIndex + 1} of ${queue.length}` : ''}
          </AppText>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.art}>
          <ArtTile seed={item.albumTitle ?? item.artist ?? title} label={initials(title)} size={280} />
        </View>

        <View style={styles.titles}>
          <AppText variant="title" numberOfLines={2} accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="bodyMedium" color="textSecondary" numberOfLines={1}>
            {[item.artist ?? 'Unknown artist', item.albumTitle].filter(Boolean).join(' · ')}
          </AppText>
        </View>

        <SeekBar position={position} duration={duration} onSeek={player.seekTo} />

        <View style={styles.controls}>
          <ControlButton
            icon="shuffle"
            label={shuffle ? 'Shuffle on' : 'Shuffle off'}
            active={shuffle}
            onPress={() => {
              player.setShuffle(!shuffle);
              setShuffle(!shuffle);
            }}
          />
          <ControlButton icon="previous" label="Previous" size={30} onPress={player.previous} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            onPress={player.togglePlay}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
            <Icon name={playing ? 'pause' : 'play'} size={32} color={theme.colors.background} />
          </Pressable>
          <ControlButton icon="next" label="Next" size={30} onPress={player.next} />
          <ControlButton
            icon="repeat"
            label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            active={repeat !== 'off'}
            badge={repeat === 'one' ? '1' : undefined}
            onPress={() => setRepeat(player.cycleRepeat())}
          />
        </View>

        <View style={styles.upNext}>
          <View style={styles.upNextHeader}>
            <AppText variant="overline" color="textMuted" accessibilityRole="header">
              Up next
            </AppText>
            <AppText variant="caption" color="textMuted">
              {shuffle ? 'Shuffle is on' : `${remaining} ${remaining === 1 ? 'song' : 'songs'}`}
            </AppText>
          </View>
          {upNext.map(({ q, index }) => (
            <Pressable
              key={`${q.mediaId}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Play ${q.title ?? 'song'}`}
              onPress={() => player.skipToIndex(index)}
              style={({ pressed }) => [styles.upNextRow, pressed && styles.pressedRow]}>
              <ArtTile seed={q.albumTitle ?? q.artist ?? q.title ?? ''} label={initials(q.title ?? '')} size={40} />
              <View style={styles.flex}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {q.title ?? 'Unknown song'}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {q.artist ?? 'Unknown artist'}
                </AppText>
              </View>
              <AppText variant="caption" color="textMuted">
                {q.duration ? formatDuration(q.duration * 1000) : ''}
              </AppText>
            </Pressable>
          ))}
          {!shuffle && upNext.length === 0 ? (
            <AppText variant="small" color="textMuted">
              This is the last song in the queue.
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ControlButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  active?: boolean;
  badge?: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const color = props.active === undefined ? theme.colors.text : props.active ? theme.colors.accent : theme.colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={props.active === undefined ? undefined : { selected: props.active }}
      onPress={props.onPress}
      style={({ pressed }) => [styles.control, pressed && styles.pressed]}>
      <Icon name={props.icon} size={props.size ?? 22} color={color} />
      {props.badge ? (
        <AppText variant="badge" color="accent" style={styles.badge}>
          {props.badge}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  header: { height: 64, paddingHorizontal: t.spacing.sm, flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: t.touchTarget },
  content: { paddingHorizontal: t.spacing.xxl, paddingBottom: t.spacing.xxl, gap: t.spacing.xl },
  art: { alignItems: 'center', paddingTop: t.spacing.sm },
  titles: { gap: t.spacing.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  control: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 8 },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  upNext: {
    borderRadius: t.radius.xxl,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.md,
    gap: t.spacing.xs,
  },
  upNextHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: t.spacing.xs, paddingBottom: t.spacing.xs },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.xs, borderRadius: t.radius.md },
  pressedRow: { backgroundColor: t.colors.surfaceRaised },
}));
