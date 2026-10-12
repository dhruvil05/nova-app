import type { Db, SqlValue } from './types';

export type NoteAuthor = 'user' | 'ai';

export type Note = {
  id: number;
  title: string;
  body: string;
  isPrivate: boolean;
  createdBy: NoteAuthor;
  createdAt: number;
  updatedAt: number;
};

export type NoteSearchResult = Note & { snippet: string };

/**
 * Every read and write takes `includePrivate`, and it defaults to FALSE.
 * Code that forgets to pass it can never see private notes. AI tools must
 * never pass `includePrivate: true` (spec 8.4); only the unlocked Notes UI does.
 */
export type PrivacyOption = { includePrivate?: boolean };

export type ListOptions = PrivacyOption & {
  /** Narrow the list to public or private notes. Private needs includePrivate. */
  only?: 'public' | 'private';
  limit?: number;
};

type NoteRow = {
  id: number;
  title: string;
  body: string;
  is_private: number;
  created_by: string;
  created_at: number;
  updated_at: number;
};

const NOTE_COLUMNS = 'n.id, n.title, n.body, n.is_private, n.created_by, n.created_at, n.updated_at';

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isPrivate: row.is_private === 1,
    createdBy: row.created_by === 'ai' ? 'ai' : 'user',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** SQL fragment that hides private notes unless explicitly allowed. */
function privacyClause(opts: PrivacyOption | undefined): string {
  return opts?.includePrivate === true ? '' : ' AND n.is_private = 0';
}

/**
 * Turns free text into a safe FTS5 query: every word is quoted (so FTS syntax
 * characters are treated as text) and prefix-matched, so "ari" finds "Arijit".
 */
export function toFtsQuery(input: string): string | null {
  const words = input
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/"/g, '""'))
    .filter((w) => w.length > 0);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(' ');
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function makeSnippet(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function createNotesRepo(db: Db, now: () => number = Date.now) {
  async function get(id: number, opts?: PrivacyOption): Promise<Note | null> {
    const row = await db.getFirstAsync<NoteRow>(
      `SELECT ${NOTE_COLUMNS} FROM notes n WHERE n.id = ?${privacyClause(opts)}`,
      [id],
    );
    return row ? toNote(row) : null;
  }

  return {
    get,

    /** Newest first. */
    async list(opts?: ListOptions): Promise<Note[]> {
      if (opts?.only === 'private' && opts.includePrivate !== true) return [];
      let where = `WHERE 1 = 1${privacyClause(opts)}`;
      if (opts?.only === 'public') where += ' AND n.is_private = 0';
      if (opts?.only === 'private') where += ' AND n.is_private = 1';
      const rows = await db.getAllAsync<NoteRow>(
        `SELECT ${NOTE_COLUMNS} FROM notes n ${where} ORDER BY n.updated_at DESC, n.id DESC LIMIT ?`,
        [opts?.limit ?? 500],
      );
      return rows.map(toNote);
    },

    /**
     * Full-text search, best match first. Falls back to a plain substring match
     * when FTS finds nothing (helps with Hindi/Gujarati and partial words).
     */
    async search(query: string, opts?: ListOptions): Promise<NoteSearchResult[]> {
      const fts = toFtsQuery(query);
      if (!fts) return [];
      if (opts?.only === 'private' && opts.includePrivate !== true) return [];
      const limit = opts?.limit ?? 50;
      let extra = privacyClause(opts);
      if (opts?.only === 'public') extra += ' AND n.is_private = 0';
      if (opts?.only === 'private') extra += ' AND n.is_private = 1';

      const ftsRows = await db.getAllAsync<NoteRow & { snippet: string }>(
        `SELECT ${NOTE_COLUMNS}, snippet(notes_fts, -1, '', '', '…', 16) AS snippet
         FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ?${extra}
         ORDER BY bm25(notes_fts) LIMIT ?`,
        [fts, limit],
      );
      if (ftsRows.length > 0) {
        return ftsRows.map((r) => ({ ...toNote(r), snippet: r.snippet || makeSnippet(r.body) }));
      }

      const like = `%${escapeLike(query.trim())}%`;
      const likeRows = await db.getAllAsync<NoteRow>(
        `SELECT ${NOTE_COLUMNS} FROM notes n
         WHERE (n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\')${extra}
         ORDER BY n.updated_at DESC LIMIT ?`,
        [like, like, limit],
      );
      return likeRows.map((r) => ({ ...toNote(r), snippet: makeSnippet(r.body) }));
    },

    /** Number of private notes, without revealing anything about them. */
    async countPrivate(): Promise<number> {
      const row = await db.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) AS c FROM notes WHERE is_private = 1',
        [],
      );
      return row?.c ?? 0;
    },

    async create(input: {
      title?: string;
      body?: string;
      isPrivate?: boolean;
      createdBy?: NoteAuthor;
    }): Promise<Note> {
      const ts = now();
      const result = await db.runAsync(
        `INSERT INTO notes (title, body, is_private, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.title ?? '',
          input.body ?? '',
          input.isPrivate ? 1 : 0,
          input.createdBy ?? 'user',
          ts,
          ts,
        ],
      );
      const note = await get(result.lastInsertRowId, { includePrivate: true });
      if (!note) throw new Error('Note was not saved');
      return note;
    },

    /** Returns the updated note, or null if it doesn't exist or is private and not allowed. */
    async update(
      id: number,
      patch: { title?: string; body?: string; isPrivate?: boolean },
      opts?: PrivacyOption,
    ): Promise<Note | null> {
      const sets: string[] = [];
      const params: SqlValue[] = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(patch.title);
      }
      if (patch.body !== undefined) {
        sets.push('body = ?');
        params.push(patch.body);
      }
      if (patch.isPrivate !== undefined) {
        // Changing privacy is a user-only action, and the UI unlocks first.
        if (opts?.includePrivate !== true) return null;
        sets.push('is_private = ?');
        params.push(patch.isPrivate ? 1 : 0);
      }
      if (sets.length === 0) return get(id, opts);

      sets.push('updated_at = ?');
      params.push(now());
      const result = await db.runAsync(
        `UPDATE notes AS n SET ${sets.join(', ')} WHERE n.id = ?${privacyClause(opts)}`,
        [...params, id],
      );
      if (result.changes === 0) return null;
      return get(id, { includePrivate: true });
    },

    /** Returns true if a note was deleted. */
    async remove(id: number, opts?: PrivacyOption): Promise<boolean> {
      const result = await db.runAsync(
        `DELETE FROM notes AS n WHERE n.id = ?${privacyClause(opts)}`,
        [id],
      );
      return result.changes > 0;
    },
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
