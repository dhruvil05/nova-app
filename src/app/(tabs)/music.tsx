import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { ArtTile, initials } from '@/components/ArtTile';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { LimitedBuildNotice } from '@/components/LimitedBuildNotice';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { Segmented } from '@/components/Segmented';
import { TrackRow } from '@/components/TrackRow';
import { useSettingsRepo, useTracksRepo } from '@/db/hooks';
import type { AlbumSummary, ArtistSummary, Track } from '@/db/tracksRepo';
import {
  PermissionDeniedError,
  deleteImportedTrack,
  importAudioFiles,
  scanDeviceLibrary,
  type ScanProgress,
} from '@/services/musicLibrary';
import { searchMusic } from '@/services/musicSearch';
import * as player from '@/services/player';
import { useActiveMediaItem } from '@/services/player';
import { useLibraryVersion } from '@/store/libraryVersion';
import { makeStyles, useTheme } from '@/theme';
import { confirmAction, showMenu, showMessage, type MenuOption } from '@/utils/dialog';

type Tab = 'songs' | 'artists' | 'albums';
type Drill = { kind: 'artist' | 'album'; name: string } | null;

const TABS: { value: Tab; label: string }[] = [
  { value: 'songs', label: 'Songs' },
  { value: 'artists', label: 'Artists' },
  { value: 'albums', label: 'Albums' },
];

export default function MusicScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const repo = useTracksRepo();
  const settings = useSettingsRepo();
  const activeId = player.trackIdOf(useActiveMediaItem());

  const [tab, setTab] = useState<Tab>('songs');
  const [drill, setDrill] = useState<Drill>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [counts, setCounts] = useState({ total: 0, imported: 0 });
  const [loaded, setLoaded] = useState(false);
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debouncedQuery.trim().length > 0;

  const load = useCallback(async () => {
    setCounts(await repo.counts());
    if (searching) {
      setTracks(await searchMusic(repo, debouncedQuery, 100));
    } else if (drill) {
      setTracks(await repo.list(drill.kind === 'artist' ? { artist: drill.name } : { album: drill.name }));
    } else if (tab === 'songs') {
      setTracks(await repo.list());
    } else if (tab === 'artists') {
      setArtists(await repo.artists());
    } else {
      setAlbums(await repo.albums());
    }
    setLoaded(true);
  }, [repo, searching, debouncedQuery, drill, tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => useLibraryVersion.subscribe(() => load()), [load]);

  async function rescan() {
    if (scan) return;
    if (Platform.OS === 'web') {
      showMessage('Music', 'Scanning your phone’s music needs the Android app.');
      return;
    }
    setNotice(null);
    setScan({ scanned: 0, total: 0 });
    try {
      const result = await scanDeviceLibrary(repo, setScan);
      await settings.set('music.lastScanAt', String(Date.now()));
      setPermissionDenied(false);
      setNotice(
        `Found ${result.found} ${result.found === 1 ? 'song' : 'songs'}` +
          (result.added ? `, ${result.added} new` : '') +
          (result.removed ? `, ${result.removed} removed` : ''),
      );
    } catch (e) {
      if (e instanceof PermissionDeniedError) setPermissionDenied(true);
      else showMessage('Music', 'Could not scan your music. Please try again.');
    } finally {
      setScan(null);
      useLibraryVersion.getState().bump();
    }
  }

  async function importFiles() {
    if (Platform.OS === 'web') {
      showMessage('Import', 'Importing music needs the Android app.');
      return;
    }
    setNotice(null);
    setImporting(true);
    try {
      const added = await importAudioFiles(repo);
      if (added > 0) setNotice(`Imported ${added} ${added === 1 ? 'song' : 'songs'}`);
    } catch {
      showMessage('Import', 'Could not import those files. Please try again.');
    } finally {
      setImporting(false);
      useLibraryVersion.getState().bump();
    }
  }

  async function shuffleAll() {
    const list = tracks.length > 0 && (tab === 'songs' || drill || searching) ? tracks : await repo.list();
    player.playTracks(list, { shuffle: true });
  }

  async function deleteTrack(track: Track) {
    const ok = await confirmAction({
      title: 'Delete imported song?',
      message: `“${track.title}” will be removed from Nova.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteImportedTrack(repo, track);
    useLibraryVersion.getState().bump();
  }

  function trackOptions(track: Track) {
    const items: MenuOption[] = [];
    if (player.playerAvailable) items.push({ label: 'Add to queue', onSelect: () => player.queueTracks([track]) });
    if (track.source === 'imported') items.push({ label: 'Delete', destructive: true, onSelect: () => deleteTrack(track) });
    if (items.length > 0) showMenu(track.title, items, track.artist ?? undefined);
  }

  const showingTracks = searching || drill !== null || tab === 'songs';
  const libraryEmpty = loaded && counts.total === 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header">
          Music
        </AppText>
        <View style={styles.actions}>
          <IconButton icon="refresh" label="Rescan phone for music" onPress={rescan} disabled={!!scan} />
          <IconButton icon="plus" label="Import audio files" onPress={importFiles} disabled={importing} />
        </View>
      </View>
      {!player.playerAvailable ? (
        <LimitedBuildNotice text="Playing music needs the Nova development build. In Expo Go you can scan and browse your library." />
      ) : null}
      {!libraryEmpty ? (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Songs, artists, albums" />
          {!searching && !drill ? (
            <Segmented label="Library view" options={TABS} value={tab} onChange={setTab} />
          ) : null}
        </>
      ) : null}
      {scan ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.colors.accent} />
          <AppText variant="small" color="textMuted">
            Scanning your phone… {scan.scanned} {scan.scanned === 1 ? 'song' : 'songs'}
          </AppText>
        </View>
      ) : importing ? (
        <View style={styles.status}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText variant="small" color="textMuted">
            Importing…
          </AppText>
        </View>
      ) : notice ? (
        <AppText variant="small" color="textMuted" accessibilityLiveRegion="polite">
          {notice}
        </AppText>
      ) : null}
      {drill ? (
        <View style={styles.drillRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Back to ${drill.kind === 'artist' ? 'artists' : 'albums'}`}
            onPress={() => setDrill(null)}
            style={styles.drillBack}>
            <Icon name="back" size={18} color={theme.colors.accent} />
            <AppText variant="label" color="accent">
              {drill.kind === 'artist' ? 'Artists' : 'Albums'}
            </AppText>
          </Pressable>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {drill.name}
          </AppText>
        </View>
      ) : null}
      {!libraryEmpty && showingTracks ? (
        <View style={styles.summary}>
          <AppText variant="small" color="textMuted">
            {searching || drill
              ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`
              : `${counts.total} songs${counts.imported ? ` · ${counts.imported} imported` : ''}`}
          </AppText>
          {tracks.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={shuffleAll}
              style={({ pressed }) => [styles.shufflePill, pressed && styles.pressed]}>
              <Icon name="shuffle" size={14} strokeWidth={2} color={theme.colors.onChipSelected} />
              <AppText variant="label" color="onChipSelected">
                Shuffle
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (libraryEmpty && !searching) {
    return (
      <Screen>
        {header}
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="music"
            title={permissionDenied ? 'Music access is off' : 'Find your music'}
            body={
              permissionDenied
                ? 'Nova needs permission to read the songs on your phone. You can turn it on in phone settings.'
                : 'Scan your phone for songs, or import audio files into Nova.'
            }>
            <View style={styles.emptyButtons}>
              {permissionDenied ? (
                <Button label="Open phone settings" onPress={() => Linking.openSettings()} />
              ) : (
                <Button label="Scan phone for music" onPress={rescan} busy={!!scan} />
              )}
              <Button label="Import audio files" variant="secondary" onPress={importFiles} busy={importing} />
            </View>
          </EmptyState>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {showingTracks ? (
        <FlatList
          data={tracks}
          keyExtractor={(t) => String(t.id)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              isCurrent={item.id === activeId}
              onPress={() => player.playTracks(tracks, { startIndex: index })}
              onLongPress={() => trackOptions(item)}
            />
          )}
          ListEmptyComponent={
            loaded && searching ? (
              <EmptyState icon="search" title="No songs match" body={`Nothing matches “${debouncedQuery.trim()}”.`} />
            ) : null
          }
        />
      ) : tab === 'artists' ? (
        <FlatList
          data={artists}
          keyExtractor={(a) => a.name}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <GroupRow
              seed={item.name}
              label={initials(item.name)}
              title={item.name}
              subtitle={`${item.trackCount} ${item.trackCount === 1 ? 'song' : 'songs'}`}
              onPress={() => setDrill({ kind: 'artist', name: item.name })}
            />
          )}
          ListEmptyComponent={
            loaded ? <EmptyState icon="music" title="No artists" body="Songs without artist tags appear under Songs." /> : null
          }
        />
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.name}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <GroupRow
              seed={item.name}
              title={item.name}
              subtitle={`${item.artist ?? 'Various artists'} · ${item.trackCount} ${item.trackCount === 1 ? 'song' : 'songs'}`}
              onPress={() => setDrill({ kind: 'album', name: item.name })}
            />
          )}
          ListEmptyComponent={
            loaded ? <EmptyState icon="music" title="No albums" body="Songs without album tags appear under Songs." /> : null
          }
        />
      )}
    </Screen>
  );
}

function GroupRow(props: { seed: string; label?: string; title: string; subtitle: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.groupRow, pressed && styles.pressedRow]}>
      <ArtTile seed={props.seed} label={props.label} />
      <View style={styles.flex}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {props.title}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {props.subtitle}
        </AppText>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: t.spacing.md, paddingTop: t.spacing.lg, paddingBottom: t.spacing.sm, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: t.spacing.sm },
  actions: { flexDirection: 'row' },
  status: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingHorizontal: t.spacing.xs },
  drillRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  drillBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: t.touchTarget, paddingRight: t.spacing.sm },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.sm,
  },
  shufflePill: {
    height: 36,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.chipSelected,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.85 },
  list: { paddingHorizontal: t.spacing.sm, paddingBottom: t.spacing.xxl },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  emptyButtons: { alignSelf: 'stretch', gap: t.spacing.sm, marginTop: t.spacing.sm },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.lg,
  },
  pressedRow: { backgroundColor: t.colors.surface },
}));
