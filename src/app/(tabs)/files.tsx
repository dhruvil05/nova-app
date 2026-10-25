import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { FileRow } from '@/components/FileRow';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { useFileActions } from '@/components/useFileActions';
import { useFilesRepo } from '@/db/hooks';
import type { FileRecord } from '@/db/filesRepo';
import { importFiles, processPendingExtractions } from '@/services/fileStore';
import { useFilesStore } from '@/store/files';
import { makeStyles, useTheme } from '@/theme';
import { showMessage } from '@/utils/dialog';

type Filter = 'all' | 'pdf' | 'docx' | 'txt' | 'ai';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'txt', label: 'TXT' },
  { value: 'ai', label: 'By Nova' },
];

export default function FilesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const repo = useFilesRepo();
  const progress = useFilesStore((s) => s.progress);
  const actions = useFileActions();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setFiles(
      await repo.list({
        query: debouncedQuery,
        kind: filter === 'all' || filter === 'ai' ? undefined : filter,
        createdBy: filter === 'ai' ? 'ai' : undefined,
      }),
    );
    setLoaded(true);
  }, [repo, debouncedQuery, filter]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Finish any extraction interrupted by the app closing.
      processPendingExtractions(repo).catch(() => {});
    }, [load, repo]),
  );
  useEffect(() => useFilesStore.subscribe((s, prev) => s.version !== prev.version && load()), [load]);

  async function startImport() {
    if (Platform.OS === 'web') {
      showMessage('Import', 'Importing files needs the Android app. The web preview can only show files already in Nova.');
      return;
    }
    setImporting(true);
    try {
      const { imported, skipped } = await importFiles(repo);
      if (skipped.length > 0) {
        showMessage('Some files were skipped', `Nova can read PDF, DOCX and TXT files.\n\nSkipped: ${skipped.join(', ')}`);
      }
      if (imported.length > 0) setFilter('all');
    } catch {
      showMessage('Import', 'Could not import those files. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  const empty = loaded && files.length === 0;
  const filtering = debouncedQuery.trim() !== '' || filter !== 'all';

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          Files
        </AppText>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search files" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={files}
        keyExtractor={(f) => String(f.id)}
        contentContainerStyle={[styles.list, empty && styles.listEmpty]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <FileRow
            file={item}
            progress={progress[item.id]}
            onPress={() => router.push({ pathname: '/file/[id]', params: { id: String(item.id) } })}
            onLongPress={() => actions.showMenu(item)}
          />
        )}
        ListEmptyComponent={
          empty ? (
            filtering ? (
              <EmptyState icon="search" title="No matching files" body="Try another name or filter." />
            ) : (
              <EmptyState
                icon="folder"
                title="No files yet"
                body="Import PDF, DOCX or TXT files. Nova reads their text so you can ask about them later."
              />
            )
          ) : null
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: importing }}
        disabled={importing}
        onPress={startImport}
        style={({ pressed }) => [styles.fab, (pressed || importing) && styles.fabPressed]}>
        <Icon name="import" size={22} strokeWidth={2} color={theme.colors.onAccent} />
        <AppText variant="label" color="onAccent">
          {importing ? 'Importing…' : 'Import'}
        </AppText>
      </Pressable>

      {actions.dialog}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  header: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg, gap: 14 },
  filters: { gap: t.spacing.sm, paddingRight: t.spacing.xl },
  list: { paddingHorizontal: t.spacing.sm, paddingTop: t.spacing.md, paddingBottom: 120 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: t.spacing.xl,
    bottom: t.spacing.xl,
    height: 56,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: t.radius.xxl,
    backgroundColor: t.colors.accentStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  fabPressed: { opacity: 0.85 },
}));
