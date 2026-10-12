/**
 * The subset of expo-sqlite's SQLiteDatabase that the repositories use.
 * Keeping it this small lets unit tests run the same code against Node's
 * built-in SQLite (see src/db/testing/nodeDb.ts).
 */
export type SqlValue = string | number | null;

export type RunResult = { lastInsertRowId: number; changes: number };

export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<RunResult>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
