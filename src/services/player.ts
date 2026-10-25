import type * as RNTP from '@rntp/player';

import type { Track } from '@/db/tracksRepo';

import { HAS_TRACK_PLAYER } from './nativeModules';

type MediaItem = RNTP.MediaItem;
type Progress = RNTP.Progress;

/**
 * The one music player shared by the Music screens and (Phase 4) the AI's tools,
 * so "play Arijit Singh" from chat behaves exactly like tapping a song (spec 10.2).
 *
 * Built on @rntp/player v5 (Media3 on Android). Lock-screen, notification and
 * headphone controls, audio focus (pause for calls, resume after) and
 * pause-on-unplug are handled natively; no JS runs for them.
 *
 * @rntp/player connects to its native module as soon as it's imported, so it is
 * only loaded when that module exists (not in Expo Go, where every call here
 * becomes a no-op).
 */
const rntp: typeof RNTP | null = HAS_TRACK_PLAYER
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@rntp/player') as typeof RNTP)
  : null;
const TrackPlayer = rntp?.default ?? null;

/** False in Expo Go: music can be browsed but not played. */
export const playerAvailable = TrackPlayer !== null;

export type RepeatSetting = 'off' | 'all' | 'one';

// Hooks: the real ones when the player exists, harmless stand-ins otherwise.
const noProgress: Progress = { position: 0, duration: 0, buffered: 0, cached: 0 };
export const useActiveMediaItem: () => MediaItem | null = rntp ? rntp.useActiveMediaItem : () => null;
export const useIsPlaying: () => boolean = rntp ? rntp.useIsPlaying : () => false;
export const useProgress: (updateInterval?: number) => Progress = rntp ? rntp.useProgress : () => noProgress;

let ready = false;

/** Call once at app start, while the app is in the foreground (Android requirement). */
export function setupPlayer(): void {
  if (ready || !rntp || !TrackPlayer) return;
  TrackPlayer.setupPlayer({
    contentType: 'music',
    handleAudioBecomingNoisy: true,
    audioMixing: 'exclusive',
    android: { wakeMode: 'local', taskRemovedBehavior: 'continue' },
  });
  const { PlayerCommand } = rntp;
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
  if (tracks.length === 0 || !TrackPlayer) return;
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
  if (tracks.length === 0 || !TrackPlayer) return;
  setupPlayer();
  TrackPlayer.addMediaItems(tracks.map(toMediaItem));
}

export function pause(): void {
  TrackPlayer?.pause();
}

export function resume(): void {
  TrackPlayer?.play();
}

/** Music volume while Nova listens and speaks (spec 9.1: music is ducked). */
const DUCKED_VOLUME = 0.15;
let volumeBeforeDuck: number | null = null;

/** Lowers our own player only; other apps and the system volume are untouched. */
export function duck(): void {
  if (!ready || !TrackPlayer || volumeBeforeDuck !== null) return;
  volumeBeforeDuck = TrackPlayer.getVolume();
  TrackPlayer.setVolume(Math.min(volumeBeforeDuck, DUCKED_VOLUME));
}

export function unduck(): void {
  if (!ready || !TrackPlayer || volumeBeforeDuck === null) return;
  TrackPlayer.setVolume(volumeBeforeDuck);
  volumeBeforeDuck = null;
}

export function isPlaying(): boolean {
  return ready && TrackPlayer ? TrackPlayer.isPlaying() : false;
}

export function togglePlay(): void {
  if (!TrackPlayer) return;
  if (TrackPlayer.isPlaying()) TrackPlayer.pause();
  else TrackPlayer.play();
}

export function next(): void {
  TrackPlayer?.skipToNext();
}

/** Like most players: restarts the song if more than 3 s in, otherwise goes back one. */
export function previous(): void {
  if (!TrackPlayer) return;
  if (TrackPlayer.getProgress().position > 3) TrackPlayer.seekTo(0);
  else TrackPlayer.skipToPrevious();
}

export function seekTo(seconds: number): void {
  TrackPlayer?.seekTo(Math.max(0, seconds));
}

export function setShuffle(enabled: boolean): void {
  TrackPlayer?.setShuffleEnabled(enabled);
}

export function isShuffleEnabled(): boolean {
  return ready && TrackPlayer ? TrackPlayer.isShuffleEnabled() : false;
}

/** Off → All → One → Off */
export function cycleRepeat(): RepeatSetting {
  if (!TrackPlayer) return 'off';
  const order: RepeatSetting[] = ['off', 'all', 'one'];
  const current = TrackPlayer.getRepeatMode() as RepeatSetting;
  const nextMode = order[(order.indexOf(current) + 1) % order.length];
  TrackPlayer.setRepeatMode(nextMode as RNTP.RepeatMode);
  return nextMode;
}

export function getRepeatMode(): RepeatSetting {
  return ready && TrackPlayer ? (TrackPlayer.getRepeatMode() as RepeatSetting) : 'off';
}

/** Id of the song currently loaded (playing or paused), or null. */
export function currentTrackId(): number | null {
  return ready && TrackPlayer ? trackIdOf(TrackPlayer.getActiveMediaItem()) : null;
}

/** Remaining queue length, for the "Up next" list. */
export function getQueue(): { items: MediaItem[]; activeIndex: number | null } {
  if (!ready || !TrackPlayer) return { items: [], activeIndex: null };
  return { items: TrackPlayer.getQueue(), activeIndex: TrackPlayer.getActiveMediaItemIndex() };
}

export function skipToIndex(index: number): void {
  if (!TrackPlayer) return;
  TrackPlayer.skipToIndex(index);
  TrackPlayer.play();
}
