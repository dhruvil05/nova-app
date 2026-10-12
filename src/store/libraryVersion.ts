import { create } from 'zustand';

/**
 * Bumped after the music library changes outside the Music screen
 * (and later by the AI), so lists know to reload.
 */
export const useLibraryVersion = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
