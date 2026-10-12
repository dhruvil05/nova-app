/**
 * @jest-environment node
 */
import { migrate } from '@/db/migrate';
import { createNodeDb } from '@/db/testing/nodeDb';
import { createTracksRepo } from '@/db/tracksRepo';

import { searchMusic } from '../musicSearch';

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  const repo = createTracksRepo(db);
  await repo.upsertMany([
    { uri: 'u1', title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmastra', source: 'device' },
    { uri: 'u2', title: 'Channa Mereya', artist: 'Arijit Singh', album: 'Ae Dil Hai Mushkil', source: 'device' },
    { uri: 'u3', title: 'Kun Faya Kun', artist: 'A. R. Rahman', album: 'Rockstar', source: 'device' },
    { uri: 'u4', title: 'Jai Ho', artist: 'A. R. Rahman', album: 'Slumdog Millionaire', source: 'device' },
    { uri: 'u5', title: 'Arijit Medley', artist: 'Cover Band', album: 'Live', source: 'imported' },
  ]);
  return repo;
}

describe('searchMusic', () => {
  it('finds songs by artist, case-insensitively', async () => {
    const repo = await setup();
    const titles = (await searchMusic(repo, 'arijit')).map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['Kesariya', 'Channa Mereya', 'Arijit Medley']));
    expect(titles).toHaveLength(3);
  });

  it('tolerates typos via the fuzzy fallback', async () => {
    const repo = await setup();
    const titles = (await searchMusic(repo, 'rahmaan')).map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['Kun Faya Kun', 'Jai Ho']));
  });

  it('respects the limit and handles empty queries', async () => {
    const repo = await setup();
    expect(await searchMusic(repo, 'a', 2)).toHaveLength(2);
    expect(await searchMusic(repo, '  ')).toEqual([]);
  });

  it('returns nothing for unrelated text', async () => {
    const repo = await setup();
    expect(await searchMusic(repo, 'zzqqxx')).toEqual([]);
  });
});
