import { useState } from 'react';

import { useFilesRepo } from '@/db/hooks';
import type { FileRecord } from '@/db/filesRepo';
import {
  FileNameTakenError,
  deleteFile,
  openInOtherApp,
  renameFile,
  shareFile,
} from '@/services/fileStore';
import { confirmAction, showMenu as showActionMenu, showMessage, type MenuOption } from '@/utils/dialog';

import { RenameDialog } from './RenameDialog';

/** Open / share / rename / delete for a file, shared by the Files list and viewer. */
export function useFileActions(options?: { onDeleted?: (file: FileRecord) => void; onRenamed?: () => void }) {
  const repo = useFilesRepo();
  const [renaming, setRenaming] = useState<FileRecord | null>(null);

  async function open(file: FileRecord) {
    try {
      await openInOtherApp(file);
    } catch {
      showMessage('Open file', 'No app on this phone can open this file type.');
    }
  }

  async function share(file: FileRecord) {
    try {
      await shareFile(file);
    } catch {
      showMessage('Share', 'Could not share this file.');
    }
  }

  async function confirmDelete(file: FileRecord) {
    const ok = await confirmAction({
      title: 'Delete this file?',
      message: `“${file.name}” and its text will be removed from Nova. This can’t be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFile(repo, file);
      options?.onDeleted?.(file);
    } catch {
      showMessage('Delete', 'Could not delete this file.');
    }
  }

  function showMenu(file: FileRecord) {
    const items: MenuOption[] = [];
    if (file.kind === 'pdf' || file.kind === 'docx') items.push({ label: 'Open in another app', onSelect: () => open(file) });
    items.push({ label: 'Share', onSelect: () => share(file) });
    items.push({ label: 'Rename', onSelect: () => setRenaming(file) });
    items.push({ label: 'Delete', destructive: true, onSelect: () => confirmDelete(file) });
    showActionMenu(file.name, items);
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
