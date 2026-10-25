import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { speechRecognitionInstalled } from '@/voice/recognizer';

import { Icon } from '../Icon';

type Props = {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Opens voice mode */
  onMic: () => void;
};

/** Message box with Send, the mic (when empty), or Stop while Nova is working. */
export function Composer({ busy, onSend, onStop, onMic }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !busy;

  function send() {
    if (!canSend) return;
    onSend(text);
    setText('');
  }

  return (
    <View style={styles.row}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Ask Nova anything…"
        placeholderTextColor={theme.colors.placeholder}
        accessibilityLabel="Message Nova"
        multiline
        style={styles.input}
        selectionColor={theme.colors.accent}
        submitBehavior="newline"
      />
      {busy ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Stop Nova" onPress={onStop} style={[styles.button, styles.stop]}>
          <Icon name="stop" size={18} color={theme.colors.text} />
        </Pressable>
      ) : text.trim().length === 0 && speechRecognitionInstalled ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Talk to Nova" onPress={onMic} style={[styles.button, styles.send]}>
          <Icon name="mic" size={22} color={theme.colors.onAccent} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={[styles.button, styles.send, !canSend && styles.disabled]}>
          <Icon name="send" size={22} strokeWidth={2.2} color={theme.colors.onAccent} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface,
    color: t.colors.text,
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 13,
    ...t.typography.body,
  },
  button: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  send: { backgroundColor: t.colors.accentStrong },
  stop: { backgroundColor: t.colors.surfaceRaised, borderWidth: 1, borderColor: t.colors.borderStrong },
  disabled: { opacity: 0.4 },
}));
