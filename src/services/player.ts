import TrackPlayer, { PlayerCommand, RepeatMode, type MediaItem } from '@rntp/player';

import type { Track } from '@/db/tracksRepo';

/**
 * The one music player shared by the Music screens and (Phase 4) the AI's tools,
 * so "play Arijit Singh" from chat behaves exactly like tapping a song (spec 10.2).
 *
 * Built on @rntp/player v5 (Media3 on Android). Lock-screen, notification and
 * headphone controls, audio focus (pause for calls, resume after) and
 * pause-on-unplug are handled natively; no JS runs for them.
 */

let ready = false;

/** Call once at app start, while the app is in the foreground (Android requirement). */
export function setupPlayer(): void {
  if (ready) return;
  TrackPlayer.setupPlayer({
    contentType: 'music',
    handleAudioBecomingNoisy: true,
    audioMixing: 'exclusive',
    android: { wakeMode: 'local', taskRemovedBehavior: 'continue' },
  });
  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Next,
      PlayerCommand.Previous,
      PlayerCommand.Seek,
      PlayerCommand.Stop,
    ],
  });
  ready = true;
}

function toMediaItem(track: Track): MediaItem {
  return {
    mediaId: String(track.id),
    url: track.uri,
    title: track.title,
    artist: track.artist ?? undefined,
    albumTitle: track.album ?? undefined,
    duration: track.durationMs ? track.durationMs / 1000 : undefined,
  };
}

/** Our track id for a queue item, or null for anything we didn't queue. */
export function trackIdOf(item: MediaItem | null | undefined): number | null {
  const id = Number(item?.mediaId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Replaces the queue and starts playing. With shuffle, starts on a random song. */
export function playTracks(tracks: Track[], opts?: { startIndex?: number; shuffle?: boolean }): void {
  if (tracks.length === 0) return;
  setupPlayer();
  const shuffle = opts?.shuffle ?? false;
  const start = shuffle
    ? Math.floor(Math.random() * tracks.length)
    : Math.min(Math.max(opts?.startIndex ?? 0, 0), tracks.length - 1);
  TrackPlayer.setShuffleEnabled(shuffle);
  TrackPlayer.setMediaItems(tracks.map(toMediaItem), start);
  TrackPlayer.play();
}

/** Adds songs to the end of the current queue. */
export function queueTracks(tracks: Track[]): void {
  if (tracks.length === 0) return;
  setupPlayer();
  TrackPlayer.addMediaItems(tracks.map(toMediaItem));
}

export function pause(): void {
  TrackPlayer.pause();
}

export function resume(): void {
  TrackPlayer.play();
}

export function togglePlay(): void {
  if (TrackPlayer.isPlaying()) TrackPlayer.pause();
  else TrackPlayer.play();
}

export function next(): void {
  TrackPlayer.skipToNext();
}

/** Like most players: restarts the song if more than 3 s in, otherwise goes back one. */
export function previous(): void {
  if (TrackPlayer.getProgress().position > 3) TrackPlayer.seekTo(0);
  else TrackPlayer.skipToPrevious();
}

export function seekTo(seconds: number): void {
  TrackPlayer.seekTo(Math.max(0, seconds));
}

export function setShuffle(enabled: boolean): void {
  TrackPlayer.setShuffleEnabled(enabled);
}

export function isShuffleEnabled(): boolean {
  return ready ? TrackPlayer.isShuffleEnabled() : false;
}

/** Off → All → One → Off */
export function cycleRepeat(): RepeatMode {
  const order = [RepeatMode.Off, RepeatMode.All, RepeatMode.One];
  const nextMode = order[(order.indexOf(TrackPlayer.getRepeatMode()) + 1) % order.length];
  TrackPlayer.setRepeatMode(nextMode);
  return nextMode;
}

export function getRepeatMode(): RepeatMode {
  return ready ? TrackPlayer.getRepeatMode() : RepeatMode.Off;
}

/** Id of the song currently loaded (playing or paused), or null. */
export function currentTrackId(): number | null {
  return ready ? trackIdOf(TrackPlayer.getActiveMediaItem()) : null;
}

/** Remaining queue length, for the "Up next" list. */
export function getQueue(): { items: MediaItem[]; activeIndex: number | null } {
  if (!ready) return { items: [], activeIndex: null };
  return { items: TrackPlayer.getQueue(), activeIndex: TrackPlayer.getActiveMediaItemIndex() };
}

export function skipToIndex(index: number): void {
  TrackPlayer.skipToIndex(index);
  TrackPlayer.play();
}
