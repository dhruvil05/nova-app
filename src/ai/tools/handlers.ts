import { DEFAULT_MAX_CHARS, type FileRecord, type FilesRepo } from '@/db/filesRepo';
import type { NotesRepo } from '@/db/notesRepo';
import type { Track, TracksRepo } from '@/db/tracksRepo';

import { TOOL_SCHEMAS } from './definitions';
import { validateInput } from './validate';

/**
 * Everything a tool may touch, passed in so the same handlers run in the app and
 * in unit tests. Notes are ALWAYS read and written with the repo's default
 * privacy option (private notes hidden), never `includePrivate: true` (spec 8.4).
 */
export type ToolContext = {
  notes: NotesRepo;
  files: FilesRepo;
  tracks: TracksRepo;
  music: {
    search(query: string, limit: number): Promise<Track[]>;
    play(tracks: Track[], opts: { shuffle: boolean }): void;
    control(action: 'pause' | 'resume' | 'next' | 'previous'): void;
    nowPlaying(): { trackId: number | null; playing: boolean };
  };
  saveTextFile(name: string, content: string): Promise<FileRecord>;
  /** Shows the on-screen confirmation; resolves true if the user agreed. */
  confirm(request: { title: string; message: string; confirmLabel: string }): Promise<boolean>;
  /** True when talking through the lock screen (Phase 6): destructive tools are refused. */
  locked?: boolean;
  /** Lets screens refresh after the AI changes data. */
  onChange?(area: 'notes' | 'files' | 'music'): void;
};

export type ToolOutcome = { result: Record<string, unknown>; isError: boolean };

const SEARCH_LIMIT = 10;
const MAX_READ_CHARS = 60_000;
const PLAY_QUERY_LIMIT = 50;

function ok(result: Record<string, unknown>): ToolOutcome {
  return { result, isError: false };
}

function fail(error: string): ToolOutcome {
  return { result: { error }, isError: true };
}

function trackSummary(t: Track) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration_seconds: t.durationMs ? Math.round(t.durationMs / 1000) : null,
  };
}

function fileSummary(f: FileRecord) {
  return {
    id: f.id,
    name: f.name,
    type: f.kind,
    size_bytes: f.size,
    pages: f.pageCount,
    text: f.extractionStatus === 'done' ? (f.textLength > 0 ? 'readable' : 'empty') : f.extractionStatus === 'pending' ? 'still extracting' : `unreadable (${f.extractionError ?? 'error'})`,
    created_by: f.createdBy === 'ai' ? 'nova' : 'user',
  };
}

type Handler = (input: Record<string, any>, ctx: ToolContext) => Promise<ToolOutcome>;

const handlers: Record<string, Handler> = {
  async create_note({ title, body }, ctx) {
    const note = await ctx.notes.create({ title: String(title).trim(), body: String(body), createdBy: 'ai' });
    ctx.onChange?.('notes');
    return ok({ created: true, id: note.id, title: note.title });
  },

  async search_notes({ query }, ctx) {
    const found = await ctx.notes.search(String(query), { limit: SEARCH_LIMIT });
    return ok({
      count: found.length,
      notes: found.map((n) => ({ id: n.id, title: n.title, snippet: n.snippet, updated_at: new Date(n.updatedAt).toISOString() })),
    });
  },

  async get_note({ id }, ctx) {
    const note = await ctx.notes.get(id);
    if (!note) return fail(`No note with id ${id}`);
    return ok({
      id: note.id,
      title: note.title,
      body: note.body,
      created_by: note.createdBy === 'ai' ? 'nova' : 'user',
      updated_at: new Date(note.updatedAt).toISOString(),
    });
  },

  async update_note({ id, title, body }, ctx) {
    if (title === undefined && body === undefined) return fail('Give a new title or body');
    // Locked mode allows only safe actions (spec 11); editing overwrites the user's text.
    if (ctx.locked) return fail('Editing notes needs the phone unlocked. Offer to create a new note instead.');
    const note = await ctx.notes.update(id, { title, body });
    if (!note) return fail(`No note with id ${id}`);
    ctx.onChange?.('notes');
    return ok({ updated: true, id: note.id, title: note.title });
  },

  async delete_note({ id }, ctx) {
    const note = await ctx.notes.get(id);
    if (!note) return fail(`No note with id ${id}`);
    if (ctx.locked) return fail('Deleting needs the phone unlocked to confirm. Ask the user to unlock and try again.');
    const confirmed = await ctx.confirm({
      title: 'Delete this note?',
      message: `Nova wants to delete “${note.title || 'Untitled'}”. This can’t be undone.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return ok({ deleted: false, reason: 'The user chose not to delete it.' });
    await ctx.notes.remove(id);
    ctx.onChange?.('notes');
    return ok({ deleted: true, id, title: note.title });
  },

  async search_music({ query }, ctx) {
    const found = await ctx.music.search(String(query), SEARCH_LIMIT);
    return ok({ count: found.length, tracks: found.map(trackSummary) });
  },

  async play_music({ track_ids, query, shuffle }, ctx) {
    let tracks: Track[] = [];
    if (Array.isArray(track_ids) && track_ids.length > 0) {
      tracks = await ctx.tracks.getByIds(track_ids);
      if (tracks.length === 0) return fail('None of those track ids exist. Use search_music first.');
    } else if (typeof query === 'string' && query.trim()) {
      tracks = await ctx.music.search(query, PLAY_QUERY_LIMIT);
      if (tracks.length === 0) return fail(`No songs match “${query}”.`);
    } else {
      return fail('Give track_ids or a query');
    }
    ctx.music.play(tracks, { shuffle: shuffle === true });
    ctx.onChange?.('music');
    return ok({ playing: tracks.length, shuffle: shuffle === true, first: trackSummary(tracks[0]) });
  },

  async control_playback({ action }, ctx) {
    if (!ctx.music.nowPlaying().trackId) return fail('Nothing is loaded in the player.');
    ctx.music.control(action);
    return ok({ done: true, action });
  },

  async now_playing(_input, ctx) {
    const { trackId, playing } = ctx.music.nowPlaying();
    if (!trackId) return ok({ track: null, playing: false });
    const track = (await ctx.tracks.getByIds([trackId]))[0];
    return ok({ track: track ? trackSummary(track) : null, playing });
  },

  async list_files({ query }, ctx) {
    const files = await ctx.files.list({ query: typeof query === 'string' ? query : undefined, limit: 30 });
    return ok({ count: files.length, files: files.map(fileSummary) });
  },

  async read_file({ id, max_chars }, ctx) {
    const file = await ctx.files.get(id);
    if (!file) return fail(`No file with id ${id}`);
    if (file.extractionStatus === 'pending') return fail('This file’s text is still being extracted. Try again in a moment.');
    if (file.extractionStatus === 'failed') {
      return fail(
        file.extractionError === 'scanned'
          ? 'This PDF is scanned pages with no text layer; it can’t be read until OCR is added.'
          : 'This file’s text could not be extracted.',
      );
    }
    const limit = Math.min(Math.max(typeof max_chars === 'number' ? max_chars : DEFAULT_MAX_CHARS, 1), MAX_READ_CHARS);
    const text = await ctx.files.getText(id, limit);
    if (!text) return fail(`No file with id ${id}`);
    return ok({
      id: file.id,
      name: file.name,
      pages: file.pageCount,
      truncated: text.truncated,
      total_chars: text.totalChars,
      note: text.truncated ? `Only the first ${limit} characters are included.` : undefined,
      text: text.text,
    });
  },

  async save_file({ name, content }, ctx) {
    const record = await ctx.saveTextFile(String(name), String(content));
    ctx.onChange?.('files');
    return ok({ saved: true, id: record.id, name: record.name });
  },
};

/** Runs one tool call. Never throws: problems come back as `{ error }` for Claude to handle. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const handler = handlers[name];
  const schema = TOOL_SCHEMAS[name];
  if (!handler || !schema) return fail(`Unknown tool: ${name}`);
  const valid = validateInput(input, schema);
  if (!valid.ok) return fail(`Invalid input: ${valid.error}`);
  try {
    return await handler(input as Record<string, any>, ctx);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'The tool failed');
  }
}
