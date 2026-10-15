/**
 * @jest-environment node
 */
import { createFilesRepo } from '@/db/filesRepo';
import { migrate } from '@/db/migrate';
import { createNotesRepo } from '@/db/notesRepo';
import { createNodeDb } from '@/db/testing/nodeDb';
import { createTracksRepo, type Track } from '@/db/tracksRepo';

import { TOOL_DEFINITIONS } from '../definitions';
import { executeTool, type ToolContext } from '../handlers';
import { validateInput } from '../validate';

async function setup(overrides: Partial<ToolContext> = {}) {
  const db = createNodeDb();
  await migrate(db);
  const notes = createNotesRepo(db);
  const files = createFilesRepo(db);
  const tracks = createTracksRepo(db);
  await tracks.upsertMany([
    { uri: 'u1', title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmastra', durationMs: 268_000, source: 'device' },
    { uri: 'u2', title: 'Channa Mereya', artist: 'Arijit Singh', source: 'device' },
    { uri: 'u3', title: 'Jai Ho', artist: 'A. R. Rahman', source: 'device' },
  ]);
  const played: { tracks: Track[]; shuffle: boolean }[] = [];
  const controls: string[] = [];
  let current: number | null = null;
  const ctx: ToolContext = {
    notes,
    files,
    tracks,
    music: {
      search: async (q, limit) => (await tracks.searchLike(q, limit)),
      play: (t, o) => {
        played.push({ tracks: t, shuffle: o.shuffle });
        current = t[0]?.id ?? null;
      },
      control: (a) => controls.push(a),
      nowPlaying: () => ({ trackId: current, playing: current !== null }),
    },
    saveTextFile: (name, content) => files.create({ name: `${name}.txt`, uri: `file:///${name}.txt`, createdBy: 'ai', extractedText: content }),
    confirm: jest.fn(async () => true),
    ...overrides,
  };
  return { ctx, notes, files, played, controls };
}

describe('tool definitions', () => {
  it('declares the 12 spec tools with strict schemas', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'create_note', 'search_notes', 'get_note', 'update_note', 'delete_note',
      'search_music', 'play_music', 'control_playback', 'now_playing',
      'list_files', 'read_file', 'save_file',
    ]);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
  });
});

describe('validateInput', () => {
  const schema = TOOL_DEFINITIONS.find((t) => t.name === 'play_music')!.input_schema;
  it('accepts valid input and rejects bad types, unknown fields and enums', () => {
    expect(validateInput({ track_ids: [1, 2], shuffle: true }, schema).ok).toBe(true);
    expect(validateInput({ track_ids: [1, 'x'] }, schema)).toEqual({ ok: false, error: 'track_ids[1] must be an integer' });
    expect(validateInput({ volume: 3 }, schema)).toEqual({ ok: false, error: 'volume is not allowed' });
    const control = TOOL_DEFINITIONS.find((t) => t.name === 'control_playback')!.input_schema;
    expect(validateInput({ action: 'stop' }, control).ok).toBe(false);
    expect(validateInput({}, control)).toEqual({ ok: false, error: 'action is required' });
    expect(validateInput('nope', control).ok).toBe(false);
  });
});

describe('note tools', () => {
  it('create_note makes a public note marked as created by Nova', async () => {
    const { ctx, notes } = await setup();
    const out = await executeTool('create_note', { title: 'Meeting with Raj', body: 'Moved to 5 pm' }, ctx);
    expect(out.isError).toBe(false);
    const note = await notes.get(out.result.id as number);
    expect(note).toMatchObject({ title: 'Meeting with Raj', createdBy: 'ai', isPrivate: false });
  });

  it('never exposes private notes through any tool (spec 8.4)', async () => {
    const { ctx, notes } = await setup();
    const priv = await notes.create({ title: 'Bank PIN', body: 'secret 1234', isPrivate: true });
    await notes.create({ title: 'Public', body: 'secret plans for the weekend' });

    const search = await executeTool('search_notes', { query: 'secret' }, ctx);
    expect(JSON.stringify(search.result)).not.toContain('1234');
    expect((search.result.notes as { id: number }[]).map((n) => n.id)).not.toContain(priv.id);

    for (const [name, input] of [
      ['get_note', { id: priv.id }],
      ['update_note', { id: priv.id, body: 'hacked' }],
      ['delete_note', { id: priv.id }],
    ] as const) {
      const out = await executeTool(name, input, ctx);
      expect(out.isError).toBe(true);
      expect(JSON.stringify(out.result)).not.toContain('1234');
    }
    expect((await notes.get(priv.id, { includePrivate: true }))?.body).toBe('secret 1234');
    expect(ctx.confirm).not.toHaveBeenCalled();
  });

  it('delete_note asks first and respects a "no"', async () => {
    const confirm = jest.fn(async () => false);
    const { ctx, notes } = await setup({ confirm });
    const note = await notes.create({ title: 'Old', body: 'x' });
    const out = await executeTool('delete_note', { id: note.id }, ctx);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(out.result).toMatchObject({ deleted: false });
    expect(await notes.get(note.id)).not.toBeNull();
  });

  it('delete_note is refused while locked', async () => {
    const { ctx, notes } = await setup({ locked: true });
    const note = await notes.create({ title: 'Old', body: 'x' });
    const out = await executeTool('delete_note', { id: note.id }, ctx);
    expect(out.isError).toBe(true);
    expect(String(out.result.error)).toMatch(/unlock/i);
    expect(await notes.get(note.id)).not.toBeNull();
  });
});

describe('music tools', () => {
  it('play_music by query plays matching songs', async () => {
    const { ctx, played } = await setup();
    const out = await executeTool('play_music', { query: 'arijit', shuffle: true }, ctx);
    expect(out.result).toMatchObject({ playing: 2, shuffle: true });
    expect(played[0].tracks.map((t) => t.artist)).toEqual(['Arijit Singh', 'Arijit Singh']);
  });

  it('handles "no results" and empty player politely', async () => {
    const { ctx } = await setup();
    expect((await executeTool('play_music', { query: 'zzz' }, ctx)).result.error).toMatch(/No songs/);
    expect((await executeTool('control_playback', { action: 'pause' }, ctx)).result.error).toMatch(/Nothing/);
    expect((await executeTool('now_playing', {}, ctx)).result).toEqual({ track: null, playing: false });
  });
});

describe('file tools', () => {
  it('read_file cuts long text and says so; save_file creates an AI file', async () => {
    const { ctx, files } = await setup();
    const big = await files.create({ name: 'Big.txt', uri: 'u', extractedText: 'a'.repeat(30_000) });
    const out = await executeTool('read_file', { id: big.id }, ctx);
    expect(out.result).toMatchObject({ truncated: true, total_chars: 30_000 });
    expect((out.result.text as string).length).toBe(20_000);

    const saved = await executeTool('save_file', { name: 'Leave application', content: 'Dear Sir' }, ctx);
    expect(saved.result).toMatchObject({ saved: true });
    const listed = await executeTool('list_files', { query: 'Leave' }, ctx);
    expect(listed.result).toMatchObject({ count: 1 });
  });

  it('explains scanned and pending files', async () => {
    const { ctx, files } = await setup();
    const scanned = await files.create({ name: 'Bill.pdf', uri: 'u1' });
    await files.setFailed(scanned.id, 'scanned');
    const pending = await files.create({ name: 'New.pdf', uri: 'u2' });
    expect((await executeTool('read_file', { id: scanned.id }, ctx)).result.error).toMatch(/scanned/);
    expect((await executeTool('read_file', { id: pending.id }, ctx)).result.error).toMatch(/still being extracted/);
  });
});

describe('executeTool', () => {
  it('returns errors instead of throwing', async () => {
    const { ctx } = await setup({
      saveTextFile: async () => {
        throw new Error('disk full');
      },
    });
    expect(await executeTool('nope', {}, ctx)).toEqual({ result: { error: 'Unknown tool: nope' }, isError: true });
    expect((await executeTool('get_note', { id: 'one' }, ctx)).result.error).toMatch(/Invalid input/);
    expect(await executeTool('save_file', { name: 'x', content: 'y' }, ctx)).toEqual({
      result: { error: 'disk full' },
      isError: true,
    });
  });
});
