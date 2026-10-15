import type { FilesRepo } from '@/db/filesRepo';
import type { NotesRepo } from '@/db/notesRepo';
import type { TracksRepo } from '@/db/tracksRepo';
import { saveTextFile } from '@/services/fileStore';
import { searchMusic } from '@/services/musicSearch';
import * as player from '@/services/player';
import { useFilesStore } from '@/store/files';
import { useLibraryVersion } from '@/store/libraryVersion';
import { useNotesVersion } from '@/store/notesVersion';

import type { ToolContext } from './tools/handlers';

/**
 * Connects the AI's tools to the same repositories and services the screens use,
 * so a note the AI creates is exactly like one you typed (spec 6).
 */
export function createAppToolContext(deps: {
  notes: NotesRepo;
  files: FilesRepo;
  tracks: TracksRepo;
  confirm: ToolContext['confirm'];
  locked?: boolean;
}): ToolContext {
  return {
    notes: deps.notes,
    files: deps.files,
    tracks: deps.tracks,
    music: {
      search: (query, limit) => searchMusic(deps.tracks, query, limit),
      play: (tracks, { shuffle }) => player.playTracks(tracks, { shuffle }),
      control: (action) => {
        if (action === 'pause') player.pause();
        else if (action === 'resume') player.resume();
        else if (action === 'next') player.next();
        else player.previous();
      },
      nowPlaying: () => ({ trackId: player.currentTrackId(), playing: player.isPlaying() }),
    },
    saveTextFile: (name, content) => saveTextFile(deps.files, name, content, 'ai'),
    confirm: deps.confirm,
    locked: deps.locked,
    onChange(area) {
      if (area === 'notes') useNotesVersion.getState().bump();
      else if (area === 'files') useFilesStore.getState().bump();
      else useLibraryVersion.getState().bump();
    },
  };
}
