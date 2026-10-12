import { create } from 'zustand';

/**
 * Bumped after any note write that happens outside the Notes list (the editor's
 * final save on leave, and later the AI's tools), so the list knows to reload.
 */
export const useNotesVersion = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
