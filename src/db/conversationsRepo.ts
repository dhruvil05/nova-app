import type { Db } from './types';

/**
 * Chat history. Each row is one Messages API message, stored exactly as sent or
 * received (content blocks as JSON, thinking blocks included) so the history can
 * be replayed unchanged: Claude's thinking blocks are only valid in an
 * append-only conversation, so rows are never edited, only added.
 */
export type StoredRole = 'user' | 'assistant' | 'system';

export type StoredMessage = {
  id: number;
  conversationId: number;
  role: StoredRole;
  /** A string, or an array of content blocks */
  content: unknown;
  createdAt: number;
};

export type Conversation = {
  id: number;
  title: string | null;
  createdAt: number;
  /** Time of the newest message (or creation) */
  updatedAt: number;
};

type MessageRow = { id: number; conversation_id: number; role: string; content: string; created_at: number };
type ConversationRow = { id: number; title: string | null; created_at: number; updated_at: number | null };

function toRole(role: string): StoredRole {
  return role === 'assistant' || role === 'system' ? role : 'user';
}

function parseContent(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function createConversationsRepo(db: Db, now: () => number = Date.now) {
  return {
    async create(title?: string | null): Promise<Conversation> {
      const ts = now();
      const res = await db.runAsync('INSERT INTO conversations (title, created_at) VALUES (?, ?)', [
        title ?? null,
        ts,
      ]);
      return { id: res.lastInsertRowId, title: title ?? null, createdAt: ts, updatedAt: ts };
    },

    /** Most recently active first. */
    async list(limit = 50): Promise<Conversation[]> {
      const rows = await db.getAllAsync<ConversationRow>(
        `SELECT c.id, c.title, c.created_at, MAX(m.created_at) AS updated_at
         FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
         GROUP BY c.id ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC, c.id DESC LIMIT ?`,
        [limit],
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? r.created_at,
      }));
    },

    async get(id: number): Promise<Conversation | null> {
      const r = await db.getFirstAsync<ConversationRow>(
        `SELECT c.id, c.title, c.created_at, MAX(m.created_at) AS updated_at
         FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.id = ? GROUP BY c.id`,
        [id],
      );
      return r ? { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at } : null;
    },

    async setTitle(id: number, title: string): Promise<void> {
      await db.runAsync('UPDATE conversations SET title = ? WHERE id = ?', [title, id]);
    },

    /** Messages in the order they were added. */
    async messages(conversationId: number): Promise<StoredMessage[]> {
      const rows = await db.getAllAsync<MessageRow>(
        'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id',
        [conversationId],
      );
      return rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        role: toRole(r.role),
        content: parseContent(r.content),
        createdAt: r.created_at,
      }));
    },

    async append(conversationId: number, role: StoredRole, content: unknown): Promise<StoredMessage> {
      const ts = now();
      const res = await db.runAsync(
        'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)',
        [conversationId, role, JSON.stringify(content), ts],
      );
      return { id: res.lastInsertRowId, conversationId, role, content, createdAt: ts };
    },

    async remove(id: number): Promise<void> {
      await db.runAsync('DELETE FROM messages WHERE conversation_id = ?', [id]);
      await db.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
    },

    /** Settings › Clear conversation history */
    async clearAll(): Promise<void> {
      await db.execAsync('DELETE FROM messages; DELETE FROM conversations;');
    },
  };
}

export type ConversationsRepo = ReturnType<typeof createConversationsRepo>;
