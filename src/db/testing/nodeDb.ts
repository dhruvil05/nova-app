// Test-only adapter: runs the repositories against Node's built-in SQLite
// (Node 22.5+) so unit tests exercise the real SQL, FTS5 included.
import { DatabaseSync } from 'node:sqlite';

import type { Db, RunResult, SqlValue } from '../types';

export function createNodeDb(): Db & { close(): void } {
  const db = new DatabaseSync(':memory:');

  return {
    async execAsync(source: string) {
      db.exec(source);
    },
    async runAsync(source: string, params: SqlValue[]): Promise<RunResult> {
      const result = db.prepare(source).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null> {
      const row = db.prepare(source).get(...params);
      return row === undefined ? null : ({ ...row } as T);
    },
    async getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]> {
      return db
        .prepare(source)
        .all(...params)
        .map((row) => ({ ...row }) as T);
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
