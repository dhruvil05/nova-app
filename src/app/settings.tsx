import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { useSettingsRepo } from '@/db/hooks';
import { clearApiKey, getApiKey, maskApiKey, setApiKey } from '@/services/secrets';
import { usePrivacy } from '@/store/privacy';
import { makeStyles, useTheme } from '@/theme';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const settings = useSettingsRepo();
  const unlocked = usePrivacy((s) => s.unlocked);
  const lock = usePrivacy((s) => s.lock);

  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [model, setModel] = useState('');

  useEffect(() => {
    getApiKey().then(setSavedKey);
    settings.get('ai.model').then((m) => setModel(m ?? ''));
  }, [settings]);

  async function saveKey() {
    setSavingKey(true);
    try {
      await setApiKey(keyDraft);
      setSavedKey(keyDraft.trim());
      setKeyDraft('');
      setEditingKey(false);
    } catch {
      Alert.alert('API key', 'Could not save the key. Check it is not empty and try again.');
    } finally {
      setSavingKey(false);
    }
  }

  function removeKey() {
    Alert.alert('Remove API key?', 'Nova won’t be able to reach the AI until you add a key again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearApiKey();
          setSavedKey(null);
        },
      },
    ]);
  }

  async function saveModel() {
    const value = model.trim();
    if (value) await settings.set('ai.model', value);
    else await settings.remove('ai.model');
  }

  const showKeyInput = editingKey || !savedKey;

  return (
    <Screen bottomInset>
      <View style={styles.header}>
        <IconButton icon="back" label="Back" onPress={goBack} />
        <AppText variant="heading" accessibilityRole="header">
          Settings
        </AppText>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Section title="AI">
            <View style={styles.row}>
              <View style={styles.rowText}>
                <AppText>API key</AppText>
                <AppText variant="caption" color="textMuted">
                  {savedKey
                    ? `Kept in secure storage · ${maskApiKey(savedKey)}`
                    : 'Needed for chat (Phase 4). Stored only on this phone.'}
                </AppText>
              </View>
              {savedKey && !editingKey ? (
                <Button label="Change" variant="secondary" compact onPress={() => setEditingKey(true)} />
              ) : null}
            </View>
            {showKeyInput ? (
              <View style={styles.keyForm}>
                <TextInput
                  value={keyDraft}
                  onChangeText={setKeyDraft}
                  placeholder="Paste your API key"
                  placeholderTextColor={theme.colors.placeholder}
                  accessibilityLabel="API key"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  selectionColor={theme.colors.accent}
                />
                <View style={styles.formButtons}>
                  {editingKey ? (
                    <Button
                      label="Cancel"
                      variant="secondary"
                      compact
                      onPress={() => {
                        setEditingKey(false);
                        setKeyDraft('');
                      }}
                    />
                  ) : null}
                  <Button
                    label="Save key"
                    compact
                    busy={savingKey}
                    disabled={keyDraft.trim().length === 0}
                    onPress={saveKey}
                  />
                </View>
              </View>
            ) : null}
            {savedKey ? (
              <>
                <View style={styles.divider} />
                <Button label="Remove API key" variant="secondary" compact onPress={removeKey} />
              </>
            ) : null}
            <View style={styles.divider} />
            <View style={styles.rowText}>
              <AppText>Model</AppText>
              <AppText variant="caption" color="textMuted">
                Model ID from your AI provider. Leave empty to use the default.
              </AppText>
            </View>
            <TextInput
              value={model}
              onChangeText={setModel}
              onEndEditing={saveModel}
              placeholder="Default"
              placeholderTextColor={theme.colors.placeholder}
              accessibilityLabel="Model"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              selectionColor={theme.colors.accent}
            />
          </Section>

          <Section title="Privacy">
            <View style={styles.row}>
              <View style={styles.rowText}>
                <AppText>Private notes</AppText>
                <AppText variant="caption" color="textMuted">
                  {unlocked
                    ? 'Unlocked until you leave the app.'
                    : 'Locked. They are never sent to Nova.'}
                </AppText>
              </View>
              {unlocked ? <Button label="Lock now" variant="secondary" compact onPress={lock} /> : null}
            </View>
          </Section>

          <Section title="Coming in later phases">
            <AppText variant="small" color="textMuted">
              Voice language and speed (Phase 5), “Hey Nova” wake word and battery setup (Phase 6),
              clearing chat history (Phase 4).
            </AppText>
          </Section>

          <AppText variant="caption" color="textFaint" style={styles.version}>
            Nova {Constants.expoConfig?.version ?? ''}
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="textMuted" style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  header: {
    height: 64,
    paddingHorizontal: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
  },
  scroll: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: 18 },
  section: { gap: t.spacing.sm },
  sectionTitle: { marginHorizontal: t.spacing.xs },
  card: {
    borderRadius: 18,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.lg,
    gap: t.spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  rowText: { flex: 1, gap: 2 },
  keyForm: { gap: t.spacing.sm },
  formButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm },
  input: {
    height: 48,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surfaceSunken,
    color: t.colors.text,
    paddingHorizontal: 14,
    ...t.typography.body,
  },
  divider: { height: 1, backgroundColor: t.colors.border },
  version: { textAlign: 'center' },
}));
