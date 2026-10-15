import { useState } from 'react';
import { Alert } from 'react-native';

import { useFilesRepo } from '@/db/hooks';
import type { FileRecord } from '@/db/filesRepo';
import {
  FileNameTakenError,
  deleteFile,
  openInOtherApp,
  renameFile,
  shareFile,
} from '@/services/fileStore';

import { RenameDialog } from './RenameDialog';

/** Open / share / rename / delete for a file, shared by the Files list and viewer. */
export function useFileActions(options?: { onDeleted?: (file: FileRecord) => void; onRenamed?: () => void }) {
  const repo = useFilesRepo();
  const [renaming, setRenaming] = useState<FileRecord | null>(null);

  async function open(file: FileRecord) {
    try {
      await openInOtherApp(file);
    } catch {
      Alert.alert('Open file', 'No app on this phone can open this file type.');
    }
  }

  async function share(file: FileRecord) {
    try {
      await shareFile(file);
    } catch {
      Alert.alert('Share', 'Could not share this file.');
    }
  }

  function confirmDelete(file: FileRecord) {
    Alert.alert('Delete this file?', `“${file.name}” and its text will be removed from Nova. This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFile(repo, file);
          options?.onDeleted?.(file);
        },
      },
    ]);
  }

  function showMenu(file: FileRecord) {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (file.kind === 'pdf' || file.kind === 'docx') buttons.push({ text: 'Open in another app', onPress: () => open(file) });
    buttons.push({ text: 'Share', onPress: () => share(file) });
    buttons.push({ text: 'Rename', onPress: () => setRenaming(file) });
    buttons.push({ text: 'Delete', style: 'destructive', onPress: () => confirmDelete(file) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(file.name, undefined, buttons, { cancelable: true });
  }

  const dialog = renaming ? (
    <RenameDialog
      name={renaming.name}
      onCancel={() => setRenaming(null)}
      onSubmit={async (value) => {
        try {
          await renameFile(repo, renaming, value);
          setRenaming(null);
          options?.onRenamed?.();
        } catch (e) {
          if (e instanceof FileNameTakenError) return e.message;
          return 'Could not rename the file.';
        }
      }}
    />
  ) : null;

  return { open, share, confirmDelete, rename: setRenaming, showMenu, dialog };
}
