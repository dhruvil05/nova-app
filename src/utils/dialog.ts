import { create } from 'zustand';

/**
 * App-drawn dialogs (rendered by <DialogHost /> in the root layout) instead of
 * the OS Alert: Alert's buttons do nothing on web, Android shows at most three
 * buttons, and neither follows Nova's theme.
 */

export type DialogButton = {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type Dialog = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
};

type DialogState = {
  queue: Dialog[];
  push(dialog: Omit<Dialog, 'id'>): void;
  /** Closes the visible dialog (after its button's action ran). */
  close(id: number): void;
};

let nextId = 1;

export const useDialogs = create<DialogState>((set) => ({
  queue: [],
  push: (dialog) => set((s) => ({ queue: [...s.queue, { ...dialog, id: nextId++ }] })),
  close: (id) => set((s) => ({ queue: s.queue.filter((d) => d.id !== id) })),
}));

/** A message with an OK button. */
export function showMessage(title: string, message?: string): void {
  useDialogs.getState().push({ title, message, buttons: [{ label: 'OK', style: 'cancel' }] });
}

/** Asks a yes/no question; resolves true if the user confirmed. */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.getState().push({
      title: opts.title,
      message: opts.message,
      buttons: [
        { label: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { label: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
    });
  });
}

export type MenuOption = { label: string; destructive?: boolean; onSelect: () => void };

/** A list of actions plus Cancel (any number of options). */
export function showMenu(title: string, options: MenuOption[], message?: string): void {
  useDialogs.getState().push({
    title,
    message,
    buttons: [
      ...options.map((o) => ({
        label: o.label,
        style: o.destructive ? ('destructive' as const) : ('default' as const),
        onPress: o.onSelect,
      })),
      { label: 'Cancel', style: 'cancel' },
    ],
  });
}
