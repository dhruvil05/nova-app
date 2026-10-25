import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FileTypeTile, extractionLabel } from '@/components/FileRow';
import { Icon, type IconName } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { useFileActions } from '@/components/useFileActions';
import { useFilesRepo } from '@/db/hooks';
import type { FileRecord } from '@/db/filesRepo';
import { readTextFile, retryExtraction } from '@/services/fileStore';
import { useFilesStore } from '@/store/files';
import { makeStyles, useTheme } from '@/theme';
import { formatEdited } from '@/utils/formatDate';
import { formatFileSize } from '@/utils/fileSize';

/** How much text the viewer renders at once; long files show a note instead. */
const PREVIEW_CHARS = 100_000;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/files');
}

export default function FileViewerScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const repo = useFilesRepo();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const progress = useFilesStore((s) => s.progress[id]);

  const [file, setFile] = useState<FileRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState<{ body: string; total: number } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const actions = useFileActions({ onDeleted: goBack });

  const load = useCallback(async () => {
    const record = Number.isFinite(id) ? await repo.get(id) : null;
    if (!record) {
      setMissing(true);
      return;
    }
    setFile(record);
    if (record.kind === 'txt') {
      try {
        const body = await readTextFile(record);
        setText({ body: body.slice(0, PREVIEW_CHARS), total: body.length });
      } catch {
        setText(null);
      }
    } else if (record.extractionStatus === 'done') {
      const extracted = await repo.getText(record.id, PREVIEW_CHARS);
      setText(extracted ? { body: extracted.text, total: extracted.totalChars } : null);
    } else {
      setText(null);
    }
  }, [repo, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // Reload when extraction finishes or the file is renamed.
  useEffect(() => useFilesStore.subscribe((s, prev) => s.version !== prev.version && load()), [load]);

  if (missing) {
    return (
      <Screen bottomInset>
        <View style={styles.header}>
          <IconButton icon="back" label="Back" onPress={goBack} />
        </View>
        <EmptyState icon="folder" title="File not found" body="It may have been deleted." />
      </Screen>
    );
  }
  if (!file) return <Screen>{null}</Screen>;

  const status = extractionLabel(file, progress);
  const meta = [
    formatFileSize(file.size),
    file.pageCount ? `${file.pageCount} ${file.pageCount === 1 ? 'page' : 'pages'}` : null,
    formatEdited(file.createdAt).replace('Edited', 'Added'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen bottomInset>
      <View style={styles.header}>
        <IconButton icon="back" label="Back to files" onPress={goBack} />
        <View style={styles.titleBlock}>
          <AppText variant="bodyStrong" numberOfLines={1} accessibilityRole="header">
            {file.name}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <FileTypeTile kind={file.kind} size="lg" />
          <View style={styles.summaryText}>
            {file.createdBy === 'ai' ? <Badge kind="ai" /> : null}
            <View style={styles.statusRow}>
              {status.tone === 'busy' ? <ActivityIndicator size="small" color={theme.colors.accent} /> : null}
              {status.tone === 'ok' ? <Icon name="check" size={14} strokeWidth={2.4} color={theme.colors.success} /> : null}
              <AppText variant="small" color={status.tone === 'warn' ? 'private' : 'textSecondary'}>
                {status.text}
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          {file.kind === 'pdf' || file.kind === 'docx' ? (
            <Action icon="eye" label="Open" onPress={() => actions.open(file)} />
          ) : null}
          <Action icon="share" label="Share" onPress={() => actions.share(file)} />
          <Action icon="edit" label="Rename" onPress={() => actions.rename(file)} />
          <Action icon="trash" label="Delete" danger onPress={() => actions.confirmDelete(file)} />
        </View>

        {file.extractionStatus === 'failed' ? (
          <View style={styles.warnCard}>
            <AppText variant="bodyMedium">
              {file.extractionError === 'scanned'
                ? 'This PDF is scanned pages with no text layer'
                : 'Nova couldn’t read this file’s text'}
            </AppText>
            <AppText variant="small" color="textMuted">
              {file.extractionError === 'scanned'
                ? 'Reading scanned pages needs OCR, which comes in a later update. You can still open and share it.'
                : file.extractionError === 'encrypted'
                  ? 'It is password-protected. Remove the password and import it again.'
                  : file.extractionError === 'dev-build'
                    ? 'You’re in Expo Go, which can’t read PDFs. Open the file in the Nova development build and tap Try again.'
                  : 'You can still open and share it, or try reading it again.'}
            </AppText>
            {file.extractionError !== 'scanned' && file.extractionError !== 'encrypted' ? (
              <Button
                label="Try again"
                variant="secondary"
                compact
                busy={retrying}
                onPress={async () => {
                  setRetrying(true);
                  await retryExtraction(repo, file);
                  setRetrying(false);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {text ? (
          <View style={styles.textCard}>
            {file.kind !== 'txt' ? (
              <AppText variant="overline" color="textMuted">
                Text Nova can read
              </AppText>
            ) : null}
            <AppText variant="bodyLarge" color="textSecondary" selectable>
              {text.body || '(empty)'}
            </AppText>
            {text.total > text.body.length ? (
              <AppText variant="caption" color="textMuted">
                Showing the first {text.body.length.toLocaleString('en-IN')} of {text.total.toLocaleString('en-IN')}{' '}
                characters.
              </AppText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {actions.dialog}
    </Screen>
  );
}

function Action({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, danger && styles.actionDanger, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={danger ? theme.colors.danger : theme.colors.text} />
      <AppText variant="label" color={danger ? 'danger' : 'text'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  header: { minHeight: 64, paddingHorizontal: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  titleBlock: { flex: 1, minWidth: 0 },
  content: { padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl },
  summary: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg },
  summaryText: { flex: 1, gap: t.spacing.sm, alignItems: 'flex-start' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  action: {
    flex: 1,
    minHeight: t.touchTarget,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: t.spacing.sm,
  },
  actionDanger: { borderColor: t.colors.dangerSoft },
  pressed: { opacity: 0.8 },
  warnCard: {
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.privateSurface,
    borderWidth: 1,
    borderColor: t.colors.privateBorder,
    padding: t.spacing.lg,
    gap: t.spacing.sm,
    alignItems: 'flex-start',
  },
  textCard: {
    borderRadius: t.radius.xxl,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.xl,
    gap: t.spacing.md,
  },
}));
