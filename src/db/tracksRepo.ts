import type { Db, SqlValue } from './types';

export type TrackSource = 'device' | 'imported';

export type Track = {
  id: number;
  uri: string;
  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  source: TrackSource;
  addedAt: number;
};

export type NewTrack = {
  uri: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  durationMs?: number | null;
  source: TrackSource;
};

export type ArtistSummary = { name: string; trackCount: number };
export type AlbumSummary = { name: string; artist: string | null; trackCount: number };

type TrackRow = {
  id: number;
  uri: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  source: string;
  added_at: number;
};

const COLUMNS = 'id, uri, title, artist, album, duration_ms, source, added_at';
/** SQLite's limit on bound parameters is 999 on older builds; stay well under it. */
const BATCH = 200;

function toTrack(row: TrackRow): Track {
  return {
    id: row.id,
    uri: row.uri,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    source: row.source === 'imported' ? 'imported' : 'device',
    addedAt: row.added_at,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function createTracksRepo(db: Db, now: () => number = Date.now) {
  async function getByIds(ids: number[]): Promise<Track[]> {
    if (ids.length === 0) return [];
    const found = new Map<number, Track>();
    for (const part of chunks(ids, BATCH)) {
      const rows = await db.getAllAsync<TrackRow>(
        `SELECT ${COLUMNS} FROM tracks WHERE id IN (${part.map(() => '?').join(', ')})`,
        part,
      );
      for (const r of rows) found.set(r.id, toTrack(r));
    }
    // Keep the caller's order (it is the play order); drop unknown ids.
    return ids.map((id) => found.get(id)).filter((t): t is Track => t !== undefined);
  }

  return {
    getByIds,

    async get(id: number): Promise<Track | null> {
      const row = await db.getFirstAsync<TrackRow>(`SELECT ${COLUMNS} FROM tracks WHERE id = ?`, [id]);
      return row ? toTrack(row) : null;
    },

    async getByUri(uri: string): Promise<Track | null> {
      const row = await db.getFirstAsync<TrackRow>(`SELECT ${COLUMNS} FROM tracks WHERE uri = ?`, [uri]);
      return row ? toTrack(row) : null;
    },

    /** All songs, A to Z by title. */
    async list(opts?: { artist?: string; album?: string }): Promise<Track[]> {
      const where: string[] = [];
      const params: SqlValue[] = [];
      if (opts?.artist !== undefined) {
        where.push('artist = ?');
        params.push(opts.artist);
      }
      if (opts?.album !== undefined) {
        where.push('album = ?');
        params.push(opts.album);
      }
      const rows = await db.getAllAsync<TrackRow>(
        `SELECT ${COLUMNS} FROM tracks ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY title COLLATE NOCASE, id`,
        params,
      );
      return rows.map(toTrack);
    },

    async artists(): Promise<ArtistSummary[]> {
      return db.getAllAsync<ArtistSummary>(
        `SELECT artist AS name, COUNT(*) AS trackCount FROM tracks
         WHERE artist IS NOT NULL AND artist != ''
         GROUP BY artist ORDER BY artist COLLATE NOCASE`,
        [],
      );
    },

    async albums(): Promise<AlbumSummary[]> {
      return db.getAllAsync<AlbumSummary>(
        `SELECT album AS name, MIN(artist) AS artist, COUNT(*) AS trackCount FROM tracks
         WHERE album IS NOT NULL AND album != ''
         GROUP BY album ORDER BY album COLLATE NOCASE`,
        [],
      );
    },

    async counts(): Promise<{ total: number; imported: number }> {
      const row = await db.getFirstAsync<{ total: number; imported: number | null }>(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN source = 'imported' THEN 1 ELSE 0 END) AS imported
         FROM tracks`,
        [],
      );
      return { total: row?.total ?? 0, imported: row?.imported ?? 0 };
    },

    /**
     * Songs whose title, artist or album contain every word of the query.
     * Fuzzy ranking (typos, "arijit" vs "Arijit Singh") is done in src/services/musicSearch.ts.
     */
    async searchLike(query: string, limit = 50): Promise<Track[]> {
      const words = query.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const clauses = words.map(
        () => `(title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\')`,
      );
      const params: SqlValue[] = words.flatMap((w) => {
        const like = `%${escapeLike(w)}%`;
        return [like, like, like];
      });
      const rows = await db.getAllAsync<TrackRow>(
        `SELECT ${COLUMNS} FROM tracks WHERE ${clauses.join(' AND ')}
         ORDER BY title COLLATE NOCASE LIMIT ?`,
        [...params, limit],
      );
      return rows.map(toTrack);
    },

    /**
     * Inserts new tracks and refreshes the tags of ones already known (matched by uri).
     * Returns how many were newly added.
     */
    async upsertMany(tracks: NewTrack[]): Promise<number> {
      let added = 0;
      await db.withTransactionAsync(async () => {
        for (const t of tracks) {
          const existing = await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM tracks WHERE uri = ?',
            [t.uri],
          );
          if (existing) {
            await db.runAsync(
              'UPDATE tracks SET title = ?, artist = ?, album = ?, duration_ms = ? WHERE id = ?',
              [t.title, t.artist ?? null, t.album ?? null, t.durationMs ?? null, existing.id],
            );
          } else {
            await db.runAsync(
              `INSERT INTO tracks (uri, title, artist, album, duration_ms, source, added_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [t.uri, t.title, t.artist ?? null, t.album ?? null, t.durationMs ?? null, t.source, now()],
            );
            added += 1;
          }
        }
      });
      return added;
    },

    /** After a library scan: forget device songs that are no longer on the phone. */
    async removeMissingDeviceTracks(presentUris: string[]): Promise<number> {
      const present = new Set(presentUris);
      const rows = await db.getAllAsync<{ id: number; uri: string }>(
        "SELECT id, uri FROM tracks WHERE source = 'device'",
        [],
      );
      const gone = rows.filter((r) => !present.has(r.uri)).map((r) => r.id);
      for (const part of chunks(gone, BATCH)) {
        await db.runAsync(`DELETE FROM tracks WHERE id IN (${part.map(() => '?').join(', ')})`, part);
      }
      return gone.length;
    },

    async remove(id: number): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM tracks WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}

export type TracksRepo = ReturnType<typeof createTracksRepo>;
