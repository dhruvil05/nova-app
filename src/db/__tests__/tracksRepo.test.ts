/**
 * @jest-environment node
 */
import { migrate } from '../migrate';
import { createTracksRepo, type NewTrack } from '../tracksRepo';
import { createNodeDb } from '../testing/nodeDb';

const songs: NewTrack[] = [
  { uri: 'content://1', title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmastra', durationMs: 268_000, source: 'device' },
  { uri: 'content://2', title: 'Channa Mereya', artist: 'Arijit Singh', album: 'Ae Dil Hai Mushkil', durationMs: 289_000, source: 'device' },
  { uri: 'content://3', title: 'Kun Faya Kun', artist: 'A. R. Rahman', album: 'Rockstar', durationMs: 473_000, source: 'device' },
  { uri: 'file:///music/take3.mp3', title: 'Rehearsal take 3', source: 'imported' },
];

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  const repo = createTracksRepo(db);
  await repo.upsertMany(songs);
  return repo;
}

describe('tracksRepo', () => {
  it('lists songs A to Z and counts imported ones', async () => {
    const repo = await setup();
    expect((await repo.list()).map((t) => t.title)).toEqual([
      'Channa Mereya',
      'Kesariya',
      'Kun Faya Kun',
      'Rehearsal take 3',
    ]);
    expect(await repo.counts()).toEqual({ total: 4, imported: 1 });
  });

  it('upserts by uri: rescanning updates tags without duplicating', async () => {
    const repo = await setup();
    const added = await repo.upsertMany([
      { ...songs[0], title: 'Kesariya (Film Version)' },
      { uri: 'content://5', title: 'Jai Ho', artist: 'A. R. Rahman', source: 'device' },
    ]);
    expect(added).toBe(1);
    expect((await repo.getByUri('content://1'))?.title).toBe('Kesariya (Film Version)');
    expect((await repo.counts()).total).toBe(5);
  });

  it('removes device songs that disappeared, but never imported ones', async () => {
    const repo = await setup();
    const removed = await repo.removeMissingDeviceTracks(['content://1']);
    expect(removed).toBe(2);
    expect((await repo.list()).map((t) => t.uri).sort()).toEqual(['content://1', 'file:///music/take3.mp3']);
  });

  it('groups by artist and album', async () => {
    const repo = await setup();
    expect(await repo.artists()).toEqual([
      { name: 'A. R. Rahman', trackCount: 1 },
      { name: 'Arijit Singh', trackCount: 2 },
    ]);
    expect((await repo.albums()).map((a) => a.name)).toEqual(['Ae Dil Hai Mushkil', 'Brahmastra', 'Rockstar']);
    expect((await repo.list({ artist: 'Arijit Singh' })).length).toBe(2);
  });

  it('matches every word across title, artist and album', async () => {
    const repo = await setup();
    expect((await repo.searchLike('arijit')).length).toBe(2);
    expect((await repo.searchLike('arijit brahma')).map((t) => t.title)).toEqual(['Kesariya']);
    expect(await repo.searchLike('   ')).toEqual([]);
    expect(await repo.searchLike('100%')).toEqual([]);
  });

  it('returns tracks by id in the order asked', async () => {
    const repo = await setup();
    const all = await repo.list();
    const ids = [all[2].id, 9999, all[0].id];
    expect((await repo.getByIds(ids)).map((t) => t.id)).toEqual([all[2].id, all[0].id]);
  });
});
