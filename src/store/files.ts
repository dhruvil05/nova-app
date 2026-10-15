import { create } from 'zustand';

type FilesState = {
  /** Bumped whenever the files table changes, so lists reload */
  version: number;
  /** Extraction progress (0–1) for files currently being read */
  progress: Record<number, number>;
  bump: () => void;
  setProgress: (id: number, value: number | null) => void;
};

export const useFilesStore = create<FilesState>((set) => ({
  version: 0,
  progress: {},
  bump: () => set((s) => ({ version: s.version + 1 })),
  setProgress: (id, value) =>
    set((s) => {
      const progress = { ...s.progress };
      if (value === null) delete progress[id];
      else progress[id] = value;
      return { progress };
    }),
}));
