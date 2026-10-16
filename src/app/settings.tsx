import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';

import { useChatStore } from '@/ai/chatStore';
import { MODELS, resolveModel, type ModelId } from '@/ai/models';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { VoiceSettings } from '@/components/settings/VoiceSettings';
import { WakeWordSettings } from '@/components/settings/WakeWordSettings';
import { useConversationsRepo, useSettingsRepo } from '@/db/hooks';
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
  const conversations = useConversationsRepo();

  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [model, setModel] = useState<ModelId>(resolveModel(null));

  useEffect(() => {
    getApiKey().then(setSavedKey);
    settings.get('ai.model').then((m) => setModel(resolveModel(m)));
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

  async function chooseModel(id: ModelId) {
    setModel(id);
    await settings.set('ai.model', id);
  }

  function clearHistory() {
    Alert.alert('Clear all chats?', 'Every conversation with Nova will be deleted. Notes and files Nova made stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await conversations.clearAll();
          await useChatStore.getState().open(null);
          Alert.alert('Chats cleared');
        },
      },
    ]);
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
                <AppText>Claude API key</AppText>
                <AppText variant="caption" color="textMuted">
                  {savedKey
                    ? `Kept in secure storage · ${maskApiKey(savedKey)}`
                    : 'From console.anthropic.com. Stored only on this phone.'}
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
                Changing it mid-chat works; the new model continues the conversation.
              </AppText>
            </View>
            <View accessibilityRole="radiogroup" style={styles.options}>
              {MODELS.map((m) => {
                const selected = m.id === model;
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => chooseModel(m.id)}
                    style={[styles.option, selected && styles.optionSelected]}>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.rowText}>
                      <AppText variant="bodyMedium">{m.label}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {m.description}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Voice">
            <VoiceSettings />
          </Section>

          <Section title="“Hey Nova”">
            <WakeWordSettings />
          </Section>

          <Section title="Privacy & data">
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
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowText}>
                <AppText>Conversation history</AppText>
                <AppText variant="caption" color="textMuted">
                  Stored only on this phone.
                </AppText>
              </View>
              <Button label="Clear" variant="secondary" compact onPress={clearHistory} />
            </View>
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
  options: { gap: t.spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  optionSelected: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: t.colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.accent },
  version: { textAlign: 'center' },
}));
