import type { Db } from './types';

/**
 * Non-secret key/value settings. Secrets (the API key) go in secure storage
 * via src/services/secrets.ts, never in this table.
 */
export type SettingKey =
  | 'ai.model'
  | 'voice.language'
  | 'voice.rate'
  | 'voice.ttsVoice'
  | 'voice.handsFree'
  | 'wake.sensitivity'
  | 'theme'
  | 'music.lastScanAt';

export function createSettingsRepo(db: Db) {
  return {
    async get(key: SettingKey): Promise<string | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key],
      );
      return row?.value ?? null;
    },

    async set(key: SettingKey, value: string): Promise<void> {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    },

    async remove(key: SettingKey): Promise<void> {
      await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
