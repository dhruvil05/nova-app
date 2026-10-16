import { router } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, View } from 'react-native';

import type { ChatItem } from '@/ai/transcript';
import { useChat } from '@/ai/useChat';
import { AppText } from '@/components/AppText';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { Composer } from '@/components/chat/Composer';
import { ConfirmSheet } from '@/components/chat/ConfirmSheet';
import { ToolCard } from '@/components/chat/ToolCard';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { NovaMark } from '@/components/NovaMark';
import { Screen } from '@/components/Screen';
import { makeStyles, useTheme } from '@/theme';

const SUGGESTIONS = [
  'Note that the electricity bill is due on the 15th',
  'Play something by Arijit Singh',
  'What did I note about the car service?',
  'Summarise my resume',
];

type Row = ChatItem | { kind: 'live-tool'; key: string; name: string } | { kind: 'streaming'; key: string; text: string } | { kind: 'thinking'; key: string };

export default function AiScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const chat = useChat();
  const listRef = useRef<FlatList<Row>>(null);

  const knownTools = new Set(chat.items.filter((i) => i.kind === 'tool').map((i) => i.key));
  const rows: Row[] = [
    ...chat.items,
    ...chat.liveTools.filter((t) => !knownTools.has(t.id)).map((t) => ({ kind: 'live-tool' as const, key: `live-${t.id}`, name: t.name })),
    ...(chat.streamingText ? [{ kind: 'streaming' as const, key: 'streaming', text: chat.streamingText }] : []),
    ...(chat.busy && !chat.streamingText && chat.liveTools.length === 0 ? [{ kind: 'thinking' as const, key: 'thinking' }] : []),
  ];
  const lastAssistant = [...chat.items].reverse().find((i) => i.kind === 'assistant');
  const empty = chat.items.length === 0 && !chat.busy;

  function renderRow({ item }: { item: Row }) {
    switch (item.kind) {
      case 'user':
        return <ChatBubble role="user" text={item.text} />;
      case 'assistant':
        return (
          <View style={styles.assistantBlock}>
            <ChatBubble role="assistant" text={item.text} />
            {!chat.busy && item === lastAssistant ? (
              <View style={styles.saveRow}>
                <SaveChip icon="note" label="Save as note" onPress={() => chat.saveAsNote(item.text)} />
                <SaveChip icon="folder" label="Save as TXT" onPress={() => chat.saveAsFile(item.text)} />
              </View>
            ) : null}
          </View>
        );
      case 'tool':
        return <ToolCard name={item.name} input={item.input} result={item.result} isError={item.isError} />;
      case 'live-tool':
        return <ToolCard name={item.name} input={{}} />;
      case 'streaming':
        return <ChatBubble role="assistant" text={item.text} streaming />;
      case 'thinking':
        return (
          <View style={styles.thinking} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <AppText variant="small" color="textMuted">
              Nova is thinking…
            </AppText>
          </View>
        );
      case 'note':
        return (
          <AppText variant="caption" color="textFaint" style={styles.note}>
            {item.text}
          </AppText>
        );
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.brand}>
          <NovaMark />
          <View style={styles.flex}>
            <AppText variant="heading" accessibilityRole="header">
              Nova
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {chat.title ?? 'New chat'}
            </AppText>
          </View>
        </View>
        <IconButton icon="history" label="Past chats" onPress={() => router.push('/chats')} disabled={chat.busy} />
        <IconButton icon="edit" label="New chat" onPress={chat.newChat} disabled={chat.busy || empty} />
        <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {empty ? (
          <View style={styles.empty}>
            <NovaMark size={56} />
            <AppText variant="heading" style={styles.center}>
              What can I do for you?
            </AppText>
            <AppText variant="small" color="textMuted" style={styles.center}>
              I can take notes, play your music and read your files.
            </AppText>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  onPress={() => chat.send(s)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                  <AppText variant="small">{s}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {chat.notice ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLiveRegion="polite"
            onPress={() => {
              if (chat.notice?.action === 'settings') router.push('/settings');
              chat.dismissNotice();
            }}
            style={[styles.notice, chat.notice.tone === 'error' && styles.noticeError]}>
            <AppText variant="small" color={chat.notice.tone === 'error' ? 'danger' : 'textSecondary'} style={styles.flex}>
              {chat.notice.text}
            </AppText>
            <AppText variant="label" color="accent">
              {chat.notice.action === 'settings' ? 'Settings' : 'OK'}
            </AppText>
          </Pressable>
        ) : null}

        <Composer busy={chat.busy} onSend={chat.send} onStop={chat.stop} onMic={() => router.push('/voice')} />
      </KeyboardAvoidingView>

      {chat.confirm ? (
        <ConfirmSheet
          title={chat.confirm.title}
          message={chat.confirm.message}
          confirmLabel={chat.confirm.confirmLabel}
          onAnswer={chat.answerConfirm}
        />
      ) : null}
    </Screen>
  );
}

function SaveChip({ icon, label, onPress }: { icon: 'note' | 'folder'; label: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <Icon name={icon} size={15} color={theme.colors.textSecondary} />
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  header: {
    height: 68,
    paddingLeft: t.spacing.xl,
    paddingRight: t.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { padding: t.spacing.lg, gap: 10 },
  assistantBlock: { gap: t.spacing.sm },
  saveRow: { flexDirection: 'row', gap: t.spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: t.spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.75 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xs },
  note: { textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.spacing.xxl, gap: t.spacing.md },
  suggestions: { alignSelf: 'stretch', gap: t.spacing.sm, marginTop: t.spacing.md },
  suggestion: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  notice: {
    marginHorizontal: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  noticeError: { borderColor: t.colors.dangerSoft },
}));
