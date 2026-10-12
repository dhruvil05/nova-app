import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Share, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { Toggle } from '@/components/Toggle';
import { useNotesRepo } from '@/db/hooks';
import type { Note } from '@/db/notesRepo';
import { useNotesVersion } from '@/store/notesVersion';
import { usePrivacy } from '@/store/privacy';
import { makeStyles, useTheme } from '@/theme';
import { formatEdited } from '@/utils/formatDate';

const AUTOSAVE_MS = 500;
// The Notes UI is the only caller allowed to touch private notes.
const UI = { includePrivate: true } as const;

type Status = 'loading' | 'missing' | 'ready';
type SaveState = 'saved' | 'saving';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/notes');
}

export default function NoteEditorScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const repo = useNotesRepo();
  const unlocked = usePrivacy((s) => s.unlocked);
  const unlock = usePrivacy((s) => s.unlock);

  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const [status, setStatus] = useState<Status>('loading');
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');

  // Refs let the unmount cleanup see the latest values.
  const latest = useRef({ title: '', body: '' });
  const dirty = useRef(false);
  const deleted = useRef(false);
  const repoRef = useRef(repo);
  useEffect(() => {
    repoRef.current = repo;
  }, [repo]);

  // Load the note; private notes need an unlock first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = Number.isFinite(id) ? await repo.get(id, UI) : null;
      if (cancelled) return;
      if (!found) {
        setStatus('missing');
        return;
      }
      if (found.isPrivate && !usePrivacy.getState().unlocked) {
        const ok = await unlock('Open private note');
        if (cancelled) return;
        if (!ok) {
          goBack();
          return;
        }
      }
      latest.current = { title: found.title, body: found.body };
      setNote(found);
      setTitle(found.title);
      setBody(found.body);
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [id, repo, unlock]);

  // If the app locks while a private note is open, leave the screen.
  useEffect(() => {
    if (status === 'ready' && note?.isPrivate && !unlocked) goBack();
  }, [status, note?.isPrivate, unlocked]);

  // Autosave 500 ms after typing stops (spec 10.1).
  useEffect(() => {
    if (!dirty.current) return;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      const updated = await repoRef.current.update(id, latest.current, UI);
      dirty.current = false;
      if (updated) setNote(updated);
      setSaveState('saved');
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [title, body, id]);

  // On leave: save pending edits, and drop notes that were never written in.
  useEffect(() => {
    return () => {
      if (deleted.current) return;
      const { title: t, body: b } = latest.current;
      const { bump } = useNotesVersion.getState();
      if (t.trim() === '' && b.trim() === '') {
        repoRef.current.remove(id, UI).then(bump);
      } else if (dirty.current) {
        repoRef.current.update(id, { title: t, body: b }, UI).then(bump);
      }
    };
  }, [id]);

  function edit(next: { title?: string; body?: string }) {
    latest.current = { ...latest.current, ...next };
    dirty.current = true;
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
  }

  async function setPrivate(next: boolean) {
    const ok = await unlock(next ? 'Make this note private' : 'Let Nova read this note');
    if (!ok) return;
    const updated = await repo.update(id, { ...latest.current, isPrivate: next }, UI);
    dirty.current = false;
    if (updated) setNote(updated);
    setSaveState('saved');
  }

  function confirmDelete() {
    Alert.alert('Delete this note?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          deleted.current = true;
          await repo.remove(id, UI);
          goBack();
        },
      },
    ]);
  }

  function share() {
    const text = [title.trim(), body.trim()].filter(Boolean).join('\n\n');
    if (text) Share.share({ message: text });
  }

  if (status === 'missing') {
    return (
      <Screen bottomInset>
        <View style={styles.header}>
          <IconButton icon="back" label="Back" onPress={goBack} />
        </View>
        <EmptyState icon="note" title="Note not found" body="It may have been deleted.">
          <Button label="Back to notes" variant="secondary" onPress={goBack} />
        </EmptyState>
      </Screen>
    );
  }

  if (status === 'loading' || !note) return <Screen>{null}</Screen>;

  const isNew = note.title === '' && note.body === '' && note.createdAt === note.updatedAt;

  return (
    <Screen bottomInset>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={styles.header}>
          <IconButton icon="back" label="Back to notes" onPress={goBack} />
          <View style={styles.headerRight}>
            <View style={styles.saved} accessibilityLiveRegion="polite">
              {saveState === 'saved' ? (
                <Icon name="check" size={14} strokeWidth={2} color={theme.colors.textMuted} />
              ) : null}
              <AppText variant="label" color="textMuted">
                {saveState === 'saved' ? 'Saved' : 'Saving…'}
              </AppText>
            </View>
            <IconButton icon="share" label="Share note" onPress={share} size={20} />
            <IconButton icon="trash" label="Delete note" onPress={confirmDelete} size={20} />
          </View>
        </View>

        <View style={styles.content}>
          <TextInput
            value={title}
            onChangeText={(v) => edit({ title: v })}
            placeholder="Title"
            placeholderTextColor={theme.colors.placeholder}
            accessibilityLabel="Title"
            autoFocus={isNew}
            returnKeyType="next"
            style={styles.title}
            selectionColor={theme.colors.accent}
          />
          <View style={styles.meta}>
            <Badge kind={note.createdBy === 'ai' ? 'ai' : 'user'} />
            <AppText variant="caption" color="textFaint">
              {formatEdited(note.updatedAt)}
            </AppText>
          </View>
          <TextInput
            value={body}
            onChangeText={(v) => edit({ body: v })}
            placeholder="Start writing…"
            placeholderTextColor={theme.colors.placeholder}
            accessibilityLabel="Note"
            multiline
            textAlignVertical="top"
            style={styles.body}
            selectionColor={theme.colors.accent}
          />
        </View>

        <View style={[styles.privacyBar, note.isPrivate && styles.privacyBarPrivate]}>
          <View style={[styles.privacyIcon, note.isPrivate && styles.privacyIconPrivate]}>
            <Icon
              name={note.isPrivate ? 'lock' : 'eye'}
              size={20}
              color={note.isPrivate ? theme.colors.private : theme.colors.accent}
            />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyMedium">
              {note.isPrivate ? 'Private: hidden from Nova' : 'Nova can read this note'}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {note.isPrivate
                ? 'Opening it needs your fingerprint or PIN'
                : 'Make it private to hide it from Nova'}
            </AppText>
          </View>
          <Toggle value={note.isPrivate} onChange={setPrivate} label="Private note" />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  header: {
    height: 64,
    paddingLeft: t.spacing.md,
    paddingRight: t.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 6 },
  content: { flex: 1, paddingHorizontal: t.spacing.xxl, gap: 10 },
  title: { ...t.typography.noteTitle, color: t.colors.text, padding: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  body: { flex: 1, ...t.typography.bodyLarge, color: t.colors.textSecondary, padding: 0, marginTop: t.spacing.sm },
  privacyBar: {
    marginHorizontal: t.spacing.lg,
    marginVertical: t.spacing.md,
    paddingHorizontal: 14,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  privacyBarPrivate: { backgroundColor: t.colors.privateSurface, borderColor: t.colors.privateBorder },
  privacyIcon: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyIconPrivate: { backgroundColor: t.colors.privateSoft },
}));
