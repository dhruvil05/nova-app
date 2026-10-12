import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { NovaMark } from '@/components/NovaMark';
import { Screen } from '@/components/Screen';
import { getApiKey } from '@/services/secrets';
import { makeStyles } from '@/theme';

/** AI tab. Chat, tools and voice arrive in Phases 4–6; for now it guides setup. */
export default function AiScreen() {
  const styles = useStyles();
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      getApiKey().then((k) => setHasKey(Boolean(k)));
    }, []),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.brand}>
          <NovaMark />
          <AppText variant="heading" accessibilityRole="header">
            Nova
          </AppText>
        </View>
        <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <View style={styles.body}>
        <EmptyState
          icon="sparkles"
          title="Chat is coming soon"
          body={
            hasKey
              ? 'Your API key is saved. Chat arrives in Phase 4; until then, your notes are ready in the Notes tab.'
              : 'Chat arrives in Phase 4. You can add your AI provider’s API key in Settings now.'
          }>
          {hasKey === false ? (
            <Button label="Open Settings" onPress={() => router.push('/settings')} />
          ) : null}
        </EmptyState>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    height: 68,
    paddingLeft: t.spacing.xl,
    paddingRight: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { flex: 1, justifyContent: 'center' },
}));
