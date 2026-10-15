import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';

import { createFilesRepo } from './filesRepo';
import { createNotesRepo } from './notesRepo';
import { createSettingsRepo } from './settingsRepo';
import { createTracksRepo } from './tracksRepo';

export function useNotesRepo() {
  const db = useSQLiteContext();
  return useMemo(() => createNotesRepo(db), [db]);
}

export function useFilesRepo() {
  const db = useSQLiteContext();
  return useMemo(() => createFilesRepo(db), [db]);
}

export function useTracksRepo() {
  const db = useSQLiteContext();
  return useMemo(() => createTracksRepo(db), [db]);
}

export function useSettingsRepo() {
  const db = useSQLiteContext();
  return useMemo(() => createSettingsRepo(db), [db]);
}
