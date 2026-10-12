import { getBulkMetadata } from '@missingcore/react-native-metadata-retriever';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
// The new class-based media-library API reads each field with a separate async
// call per song; the legacy paged API is far faster for a full library scan.
import * as MediaLibrary from 'expo-media-library/legacy';

import type { NewTrack, Track, TracksRepo } from '@/db/tracksRepo';
import { parseTrackFilename } from '@/utils/trackName';

/** Skip ringtones, notification sounds and short voice notes. */
const MIN_DURATION_SECONDS = 30;
const PAGE_SIZE = 200;
const TAG_BATCH = 40;
const TAG_FIELDS = ['title', 'artist', 'albumTitle'] as const;

export type ScanProgress = { scanned: number; total: number };
export type ScanResult = { found: number; added: number; removed: number };

export class PermissionDeniedError extends Error {
  constructor() {
    super('Music permission was not granted');
    this.name = 'PermissionDeniedError';
  }
}

export async function hasAudioPermission(): Promise<boolean> {
  const res = await MediaLibrary.getPermissionsAsync(false, ['audio']);
  return res.granted;
}

/** Asks for READ_MEDIA_AUDIO (Android 13+) or storage read on older Android. */
export async function requestAudioPermission(): Promise<boolean> {
  const res = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  return res.granted;
}

type Tags = { title: string | null; artist: string | null; albumTitle: string | null };

/** Reads embedded tags; any file that fails just gets no tags (filename is used instead). */
async function readTags(uris: string[]): Promise<Map<string, Tags>> {
  const tags = new Map<string, Tags>();
  for (let i = 0; i < uris.length; i += TAG_BATCH) {
    try {
      const { results } = await getBulkMetadata(uris.slice(i, i + TAG_BATCH), [...TAG_FIELDS]);
      for (const r of results) tags.set(r.uri, r.data);
    } catch {
      // Tag reading is best-effort.
    }
  }
  return tags;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function toNewTrack(
  uri: string,
  filename: string,
  tags: Tags | undefined,
  durationMs: number | null,
  source: NewTrack['source'],
): NewTrack {
  const fromName = parseTrackFilename(filename);
  return {
    uri,
    title: clean(tags?.title) ?? fromName.title,
    artist: clean(tags?.artist) ?? fromName.artist,
    album: clean(tags?.albumTitle),
    durationMs,
    source,
  };
}

/**
 * Indexes every song on the phone into the tracks table (spec 10.2), and forgets
 * songs that were deleted from the phone since the last scan.
 */
export async function scanDeviceLibrary(
  repo: TracksRepo,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  if (!(await hasAudioPermission()) && !(await requestAudioPermission())) {
    throw new PermissionDeniedError();
  }

  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: PAGE_SIZE,
      after,
    });
    assets.push(...page.assets.filter((a) => a.duration >= MIN_DURATION_SECONDS));
    onProgress?.({ scanned: assets.length, total: page.totalCount });
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }

  const tags = await readTags(assets.map((a) => a.uri));
  const tracks = assets.map((a) =>
    toNewTrack(a.uri, a.filename, tags.get(a.uri), Math.round(a.duration * 1000), 'device'),
  );

  const added = await repo.upsertMany(tracks);
  const removed = await repo.removeMissingDeviceTracks(tracks.map((t) => t.uri));
  return { found: tracks.length, added, removed };
}

function musicDir(): Directory {
  const dir = new Directory(Paths.document, 'music');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** "song.mp3" -> "song (2).mp3" if a file with that name was already imported. */
function uniqueFile(dir: Directory, name: string): File {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = new File(dir, name);
  for (let n = 2; candidate.exists; n++) candidate = new File(dir, `${base} (${n})${ext}`);
  return candidate;
}

/**
 * Lets the user pick audio files and copies them into the app's private storage,
 * so they keep working even if the originals are deleted (spec 3.3).
 * Returns the number of songs added (0 if cancelled).
 */
export async function importAudioFiles(repo: TracksRepo): Promise<number> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return 0;

  const dir = musicDir();
  const copied: { uri: string; name: string }[] = [];
  for (const asset of picked.assets) {
    const source = new File(asset.uri);
    const dest = uniqueFile(dir, asset.name);
    await source.copy(dest);
    copied.push({ uri: dest.uri, name: asset.name });
    try {
      source.delete(); // the picker's temporary cache copy
    } catch {
      // Not ours to worry about; the cache is cleared by the system.
    }
  }

  const tags = await readTags(copied.map((c) => c.uri));
  const tracks = copied.map((c) => toNewTrack(c.uri, c.name, tags.get(c.uri), null, 'imported'));
  return repo.upsertMany(tracks);
}

/** Removes an imported song and its file. Device songs are only removed by rescans. */
export async function deleteImportedTrack(repo: TracksRepo, track: Track): Promise<void> {
  if (track.source !== 'imported') return;
  try {
    const file = new File(track.uri);
    if (file.exists) file.delete();
  } catch {
    // File already gone; still remove the row.
  }
  await repo.remove(track.id);
}
