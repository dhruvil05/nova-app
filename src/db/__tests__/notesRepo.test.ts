/**
 * @jest-environment node
 */
import { LATEST_SCHEMA_VERSION, migrate } from '../migrate';
import { createNotesRepo, toFtsQuery } from '../notesRepo';
import { createNodeDb } from '../testing/nodeDb';

async function setup() {
  const db = createNodeDb();
  await migrate(db);
  let clock = 1_000;
  const repo = createNotesRepo(db, () => (clock += 1_000));
  return { db, repo };
}

describe('migrate', () => {
  it('sets the schema version and can run again safely', async () => {
    const db = createNodeDb();
    await migrate(db);
    await migrate(db);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION);
  });
});

describe('notesRepo', () => {
  it('creates, reads and lists notes newest first', async () => {
    const { repo } = await setup();
    const a = await repo.create({ title: 'First', body: 'one' });
    const b = await repo.create({ title: 'Second', body: 'two', createdBy: 'ai' });

    expect(await repo.get(a.id)).toMatchObject({ title: 'First', createdBy: 'user', isPrivate: false });
    expect(b.createdBy).toBe('ai');
    expect((await repo.list()).map((n) => n.title)).toEqual(['Second', 'First']);
  });

  it('updates the timestamp and moves edited notes to the top', async () => {
    const { repo } = await setup();
    const a = await repo.create({ title: 'Old' });
    await repo.create({ title: 'New' });
    const updated = await repo.update(a.id, { body: 'edited' });

    expect(updated?.updatedAt).toBeGreaterThan(a.updatedAt);
    expect((await repo.list())[0].id).toBe(a.id);
  });

  it('finds notes by word prefix and keeps the search index in sync', async () => {
    const { repo } = await setup();
    const note = await repo.create({ title: 'Car service', body: 'Check brake pads' });

    expect((await repo.search('brak')).map((n) => n.id)).toEqual([note.id]);

    await repo.update(note.id, { body: 'Change wiper blades' });
    expect(await repo.search('brake')).toEqual([]);
    expect((await repo.search('wiper')).map((n) => n.id)).toEqual([note.id]);

    await repo.remove(note.id);
    expect(await repo.search('wiper')).toEqual([]);
  });

  it('falls back to substring matching when full-text search finds nothing', async () => {
    const { repo } = await setup();
    const note = await repo.create({ title: 'Songs', body: 'Play Arijit tonight' });
    expect((await repo.search('rijit')).map((n) => n.id)).toEqual([note.id]);
  });

  it('treats search syntax characters as plain text', async () => {
    const { repo } = await setup();
    await repo.create({ title: 'Plain' });
    for (const q of ['"', '*', 'AND (', 'title:x', 'a OR', '%_\\']) {
      await expect(repo.search(q)).resolves.toBeDefined();
    }
    expect(toFtsQuery('  ')).toBeNull();
    expect(toFtsQuery('say "hi"')).toBe('"say"* """hi"""*');
  });

  describe('private notes (spec 8.4: never visible to the AI)', () => {
    async function withPrivate() {
      const ctx = await setup();
      const pub = await ctx.repo.create({ title: 'Bank visit', body: 'secret word pineapple public' });
      const priv = await ctx.repo.create({
        title: 'Bank PIN',
        body: 'secret word pineapple',
        isPrivate: true,
      });
      return { ...ctx, pub, priv };
    }

    it('are hidden from list, search and get by default', async () => {
      const { repo, priv, pub } = await withPrivate();

      expect((await repo.list()).map((n) => n.id)).toEqual([pub.id]);
      expect((await repo.search('pineapple')).map((n) => n.id)).toEqual([pub.id]);
      expect((await repo.search('PIN')).map((n) => n.id)).not.toContain(priv.id);
      expect(await repo.get(priv.id)).toBeNull();
      expect(await repo.list({ only: 'private' })).toEqual([]);
      expect(await repo.search('Bank', { only: 'private' })).toEqual([]);
    });

    it('cannot be edited or deleted without includePrivate', async () => {
      const { repo, priv } = await withPrivate();

      expect(await repo.update(priv.id, { body: 'overwritten' })).toBeNull();
      expect(await repo.remove(priv.id)).toBe(false);
      const stored = await repo.get(priv.id, { includePrivate: true });
      expect(stored?.body).toBe('secret word pineapple');
    });

    it('privacy can only be changed with includePrivate', async () => {
      const { repo, pub } = await withPrivate();

      expect(await repo.update(pub.id, { isPrivate: true })).toBeNull();
      expect((await repo.get(pub.id))?.isPrivate).toBe(false);

      const changed = await repo.update(pub.id, { isPrivate: true }, { includePrivate: true });
      expect(changed?.isPrivate).toBe(true);
      expect(await repo.get(pub.id)).toBeNull();
    });

    it('are visible to the unlocked UI', async () => {
      const { repo, priv } = await withPrivate();
      const opts = { includePrivate: true };

      expect((await repo.list(opts)).map((n) => n.id)).toContain(priv.id);
      expect((await repo.list({ ...opts, only: 'private' })).map((n) => n.id)).toEqual([priv.id]);
      expect((await repo.search('PIN', opts)).map((n) => n.id)).toContain(priv.id);
      expect((await repo.search('pineapple', { ...opts, only: 'private' })).map((n) => n.id)).toEqual([
        priv.id,
      ]);
      expect(await repo.countPrivate()).toBe(1);
    });
  });
});
