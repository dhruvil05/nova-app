import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { NoteCard } from '@/components/NoteCard';
import { PrivateNotesCard } from '@/components/PrivateNotesCard';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { useNotesRepo } from '@/db/hooks';
import type { Note } from '@/db/notesRepo';
import { useNotesVersion } from '@/store/notesVersion';
import { usePrivacy } from '@/store/privacy';
import { makeStyles, useTheme } from '@/theme';

type Filter = 'all' | 'public' | 'private';
type Row = Note & { snippet?: string };

export default function NotesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const repo = useNotesRepo();
  const unlocked = usePrivacy((s) => s.unlocked);
  const unlock = usePrivacy((s) => s.unlock);
  const lock = usePrivacy((s) => s.lock);

  const [chosenFilter, setFilter] = useState<Filter>('all');
  // The Private filter only applies while unlocked; locking falls back to All.
  const filter: Filter = chosenFilter === 'private' && !unlocked ? 'all' : chosenFilter;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [notes, setNotes] = useState<Row[]>([]);
  const [privateCount, setPrivateCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    const opts = {
      includePrivate: unlocked,
      only: filter === 'all' ? undefined : filter,
    } as const;
    const [rows, count] = await Promise.all([
      debouncedQuery.trim() ? repo.search(debouncedQuery, opts) : repo.list(opts),
      repo.countPrivate(),
    ]);
    // A just-created note stays empty until typed in; the editor deletes it on leave.
    setNotes(rows.filter((n) => n.title.trim() !== '' || n.body.trim() !== ''));
    setPrivateCount(count);
    setLoaded(true);
  }, [repo, unlocked, filter, debouncedQuery]);

  // Reload when a note is saved from elsewhere (e.g. the editor's final save on leave).
  useEffect(() => useNotesVersion.subscribe(() => load()), [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function choosePrivate() {
    if (await unlock('Show private notes')) setFilter('private');
  }

  async function createNote() {
    const note = await repo.create({ isPrivate: filter === 'private' && unlocked });
    router.push({ pathname: '/note/[id]', params: { id: String(note.id) } });
  }

  const searching = debouncedQuery.trim().length > 0;
  const showLockedCard = !unlocked && privateCount > 0 && filter === 'all' && !searching;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header">
            Notes
          </AppText>
          {unlocked ? (
            <IconButton icon="lock" label="Lock private notes" color="private" onPress={lock} />
          ) : null}
        </View>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search notes" />
        <View style={styles.filters}>
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Public" selected={filter === 'public'} onPress={() => setFilter('public')} />
          <Chip
            label="Private"
            icon="lock"
            tone="private"
            selected={filter === 'private'}
            onPress={choosePrivate}
          />
        </View>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          showLockedCard ? <PrivateNotesCard count={privateCount} onPress={() => unlock()} /> : null
        }
        renderItem={({ item }) => (
          <NoteCard
            note={item}
            snippet={item.snippet}
            onPress={() => router.push({ pathname: '/note/[id]', params: { id: String(item.id) } })}
          />
        )}
        ListEmptyComponent={
          loaded ? (
            searching ? (
              <EmptyState icon="search" title="No matches" body={`Nothing matches “${debouncedQuery.trim()}”.`} />
            ) : filter === 'private' ? (
              <EmptyState
                icon="lock"
                title="No private notes"
                body="Turn on “Private” inside a note to hide it from Nova."
              />
            ) : showLockedCard ? null : (
              <EmptyState
                icon="note"
                title="No notes yet"
                body="Tap + to write one. Later you can also ask Nova to take notes for you."
              />
            )
          ) : null
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New note"
        onPress={createNote}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Icon name="plus" size={26} strokeWidth={2} color={theme.colors.onAccent} />
      </Pressable>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  header: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg, gap: 14 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: t.touchTarget,
  },
  filters: { flexDirection: 'row', gap: t.spacing.sm },
  list: { padding: t.spacing.lg, gap: 10, paddingBottom: 120 },
  fab: {
    position: 'absolute',
    right: t.spacing.xl,
    bottom: t.spacing.xl,
    width: 60,
    height: 60,
    borderRadius: t.radius.xxl,
    backgroundColor: t.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: { opacity: 0.85 },
}));
