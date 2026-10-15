import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { splitExtension } from '@/utils/fileName';

import { AppText } from './AppText';
import { Button } from './Button';

type Props = {
  /** Current file name; the dialog edits the part before the extension */
  name: string;
  onCancel: () => void;
  /** Return an error message to keep the dialog open, or nothing to close it */
  onSubmit: (newName: string) => Promise<string | void>;
};

/** Text prompt for renaming (Android has no built-in Alert.prompt). */
export function RenameDialog({ name, onCancel, onSubmit }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { base, ext } = splitExtension(name);
  const [value, setValue] = useState(base);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const problem = await onSubmit(value);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Cancel rename" />
        <View style={styles.dialog} accessibilityViewIsModal>
          <AppText variant="heading" accessibilityRole="header">
            Rename file
          </AppText>
          <View style={styles.inputRow}>
            <TextInput
              value={value}
              onChangeText={(v) => {
                setValue(v);
                setError(null);
              }}
              autoFocus
              selectTextOnFocus
              accessibilityLabel="New file name"
              placeholder="File name"
              placeholderTextColor={theme.colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={styles.input}
              selectionColor={theme.colors.accent}
            />
            {ext ? (
              <AppText variant="body" color="textMuted">
                {ext}
              </AppText>
            ) : null}
          </View>
          {error ? (
            <AppText variant="small" color="danger" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          <View style={styles.buttons}>
            <Button label="Cancel" variant="secondary" compact onPress={onCancel} />
            <Button label="Rename" compact busy={busy} disabled={value.trim() === ''} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, justifyContent: 'center', padding: t.spacing.xxl },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: t.colors.scrim },
  dialog: {
    borderRadius: t.radius.sheet,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    padding: t.spacing.xl,
    gap: t.spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surfaceSunken,
    paddingHorizontal: 14,
  },
  input: { flex: 1, height: 48, color: t.colors.text, ...t.typography.body },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm },
}));
