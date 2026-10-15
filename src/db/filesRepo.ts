import type { Db, SqlValue } from './types';

export type FileKind = 'pdf' | 'docx' | 'txt' | 'other';
export type ExtractionStatus = 'pending' | 'done' | 'failed';
export type FileAuthor = 'user' | 'ai';

/** A stored file without its (possibly huge) extracted text. */
export type FileRecord = {
  id: number;
  name: string;
  uri: string;
  mimeType: string | null;
  size: number | null;
  kind: FileKind;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  pageCount: number | null;
  /** Length of the extracted text, so lists can say "no text" without loading it */
  textLength: number;
  createdBy: FileAuthor;
  createdAt: number;
};

export type FileText = {
  text: string;
  /** True when the text was cut to fit `maxChars` */
  truncated: boolean;
  totalChars: number;
};

/** Default cut for text sent to the AI (spec 8.2: read_file). */
export const DEFAULT_MAX_CHARS = 20_000;

export const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
} as const;

type FileRow = {
  id: number;
  name: string;
  uri: string;
  mime_type: string | null;
  size: number | null;
  extraction_status: string;
  extraction_error: string | null;
  page_count: number | null;
  text_length: number | null;
  created_by: string;
  created_at: number;
};

const COLUMNS = `id, name, uri, mime_type, size, extraction_status, extraction_error, page_count,
  LENGTH(extracted_text) AS text_length, created_by, created_at`;

export function kindOf(name: string, mimeType: string | null): FileKind {
  const lower = name.toLowerCase();
  if (mimeType === MIME.pdf || lower.endsWith('.pdf')) return 'pdf';
  if (mimeType === MIME.docx || lower.endsWith('.docx')) return 'docx';
  if (mimeType?.startsWith('text/') || /\.(txt|md|markdown)$/.test(lower)) return 'txt';
  return 'other';
}

function toRecord(row: FileRow): FileRecord {
  const status = row.extraction_status;
  return {
    id: row.id,
    name: row.name,
    uri: row.uri,
    mimeType: row.mime_type,
    size: row.size,
    kind: kindOf(row.name, row.mime_type),
    extractionStatus: status === 'done' || status === 'failed' ? status : 'pending',
    extractionError: row.extraction_error,
    pageCount: row.page_count,
    textLength: row.text_length ?? 0,
    createdBy: row.created_by === 'ai' ? 'ai' : 'user',
    createdAt: row.created_at,
  };
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const KIND_SQL: Record<Exclude<FileKind, 'other'>, string> = {
  pdf: `(mime_type = '${MIME.pdf}' OR LOWER(name) LIKE '%.pdf')`,
  docx: `(mime_type = '${MIME.docx}' OR LOWER(name) LIKE '%.docx')`,
  txt: `(mime_type LIKE 'text/%' OR LOWER(name) LIKE '%.txt' OR LOWER(name) LIKE '%.md')`,
};

export function createFilesRepo(db: Db, now: () => number = Date.now) {
  async function get(id: number): Promise<FileRecord | null> {
    const row = await db.getFirstAsync<FileRow>(`SELECT ${COLUMNS} FROM files WHERE id = ?`, [id]);
    return row ? toRecord(row) : null;
  }

  return {
    get,

    /** Newest first; optionally filtered by name, type or author. */
    async list(opts?: {
      query?: string;
      kind?: Exclude<FileKind, 'other'>;
      createdBy?: FileAuthor;
      limit?: number;
    }): Promise<FileRecord[]> {
      const where: string[] = [];
      const params: SqlValue[] = [];
      const q = opts?.query?.trim();
      if (q) {
        where.push(`name LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(q)}%`);
      }
      if (opts?.kind) where.push(KIND_SQL[opts.kind]);
      if (opts?.createdBy) {
        where.push('created_by = ?');
        params.push(opts.createdBy);
      }
      const rows = await db.getAllAsync<FileRow>(
        `SELECT ${COLUMNS} FROM files ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC LIMIT ?`,
        [...params, opts?.limit ?? 500],
      );
      return rows.map(toRecord);
    },

    /** Files whose text still needs extracting (e.g. the app closed mid-import). */
    async listPending(): Promise<FileRecord[]> {
      const rows = await db.getAllAsync<FileRow>(
        `SELECT ${COLUMNS} FROM files WHERE extraction_status = 'pending' ORDER BY id`,
        [],
      );
      return rows.map(toRecord);
    },

    /**
     * Extracted text, cut to `maxChars` so a 200-page PDF can't overflow the AI's
     * context (spec 8.5). Returns null if the file doesn't exist.
     */
    async getText(id: number, maxChars: number = DEFAULT_MAX_CHARS): Promise<FileText | null> {
      const row = await db.getFirstAsync<{ text: string | null; total: number | null }>(
        'SELECT SUBSTR(extracted_text, 1, ?) AS text, LENGTH(extracted_text) AS total FROM files WHERE id = ?',
        [Math.max(0, maxChars), id],
      );
      if (!row) return null;
      const total = row.total ?? 0;
      return { text: row.text ?? '', truncated: total > maxChars, totalChars: total };
    },

    async create(input: {
      name: string;
      uri: string;
      mimeType?: string | null;
      size?: number | null;
      createdBy?: FileAuthor;
      /** Known text up front (TXT files, AI-written files) */
      extractedText?: string;
    }): Promise<FileRecord> {
      const hasText = input.extractedText !== undefined;
      const result = await db.runAsync(
        `INSERT INTO files (name, uri, mime_type, size, extracted_text, extraction_status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.name,
          input.uri,
          input.mimeType ?? null,
          input.size ?? null,
          hasText ? (input.extractedText ?? '') : null,
          hasText ? 'done' : 'pending',
          input.createdBy ?? 'user',
          now(),
        ],
      );
      const record = await get(result.lastInsertRowId);
      if (!record) throw new Error('File was not saved');
      return record;
    },

    async setExtracted(id: number, text: string, pageCount?: number | null): Promise<void> {
      await db.runAsync(
        `UPDATE files SET extracted_text = ?, extraction_status = 'done', extraction_error = NULL,
         page_count = COALESCE(?, page_count) WHERE id = ?`,
        [text, pageCount ?? null, id],
      );
    },

    async setFailed(id: number, reason: string, pageCount?: number | null): Promise<void> {
      await db.runAsync(
        `UPDATE files SET extraction_status = 'failed', extraction_error = ?,
         page_count = COALESCE(?, page_count) WHERE id = ?`,
        [reason, pageCount ?? null, id],
      );
    },

    async setPending(id: number): Promise<void> {
      await db.runAsync(
        "UPDATE files SET extraction_status = 'pending', extraction_error = NULL WHERE id = ?",
        [id],
      );
    },

    async rename(id: number, name: string, uri: string): Promise<void> {
      await db.runAsync('UPDATE files SET name = ?, uri = ? WHERE id = ?', [name, uri, id]);
    },

    async remove(id: number): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM files WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}

export type FilesRepo = ReturnType<typeof createFilesRepo>;
