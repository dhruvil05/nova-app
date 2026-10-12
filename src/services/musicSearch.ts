import Fuse from 'fuse.js';

import type { Track, TracksRepo } from '@/db/tracksRepo';

const FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'artist', weight: 1.5 },
    { name: 'album', weight: 1 },
  ],
  ignoreLocation: true,
  includeScore: true,
};

/** Orders tracks by how well they match the query (best first). Never drops a candidate. */
export function rankTracks(query: string, candidates: Track[]): Track[] {
  const fuse = new Fuse(candidates, { ...FUSE_OPTIONS, threshold: 1 });
  const ranked = fuse.search(query).map((r) => r.item);
  const seen = new Set(ranked.map((t) => t.id));
  return [...ranked, ...candidates.filter((t) => !seen.has(t.id))];
}

/** Typo-tolerant match over the whole library, for when no song contains the words. */
export function fuzzyTracks(query: string, library: Track[], limit: number): Track[] {
  const fuse = new Fuse(library, { ...FUSE_OPTIONS, threshold: 0.4 });
  return fuse.search(query, { limit }).map((r) => r.item);
}

/**
 * Song search shared by the Music screen and (Phase 4) the AI's search_music tool:
 * a SQL substring match first, ranked by Fuse.js; if nothing contains the words,
 * fall back to a fuzzy match so "arjit" still finds "Arijit Singh" (spec 10.2).
 */
export async function searchMusic(repo: TracksRepo, query: string, limit = 10): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];
  const candidates = await repo.searchLike(q, 200);
  if (candidates.length > 0) return rankTracks(q, candidates).slice(0, limit);
  return fuzzyTracks(q, await repo.list(), limit);
}
