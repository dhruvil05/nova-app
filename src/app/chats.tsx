import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';

import { useChatStore } from '@/ai/chatStore';
import { useBindChat } from '@/ai/useChat';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import type { Conversation } from '@/db/conversationsRepo';
import { useConversationsRepo } from '@/db/hooks';
import { makeStyles } from '@/theme';
import { formatListDate } from '@/utils/formatDate';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Past AI conversations. */
export default function ChatsScreen() {
  const styles = useStyles();
  const repo = useConversationsRepo();
  useBindChat();
  const current = useChatStore((s) => s.conversationId);
  const busy = useChatStore((s) => s.busy);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setChats(await repo.list(100));
    setLoaded(true);
  }, [repo]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(id: number | null) {
    await useChatStore.getState().open(id);
    goBack();
  }

  function confirmDelete(chat: Conversation) {
    Alert.alert('Delete this chat?', `“${chat.title ?? 'Untitled chat'}” will be removed. Notes and files Nova made stay.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await repo.remove(chat.id);
          if (chat.id === current) await useChatStore.getState().open(null);
          load();
        },
      },
    ]);
  }

  return (
    <Screen bottomInset>
      <View style={styles.header}>
        <IconButton icon="back" label="Back" onPress={goBack} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          Chats
        </AppText>
        <Button label="New chat" compact disabled={busy} onPress={() => open(null)} />
      </View>
      <FlatList
        data={chats}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens this chat. Long-press to delete."
            disabled={busy}
            onPress={() => open(item.id)}
            onLongPress={() => confirmDelete(item)}
            style={({ pressed }) => [styles.row, item.id === current && styles.current, pressed && styles.pressed]}>
            <AppText variant="bodyMedium" numberOfLines={1}>
              {item.title ?? 'Untitled chat'}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {formatListDate(item.updatedAt)}
            </AppText>
          </Pressable>
        )}
        ListEmptyComponent={loaded ? <EmptyState icon="sparkles" title="No chats yet" body="Your conversations with Nova appear here." /> : null}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  header: { height: 64, paddingHorizontal: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  list: { padding: t.spacing.md, gap: t.spacing.xs },
  row: { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, borderRadius: t.radius.lg, gap: 2 },
  current: { backgroundColor: t.colors.surfaceRaised },
  pressed: { backgroundColor: t.colors.surface },
}));
