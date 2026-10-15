import { Pressable, View } from 'react-native';

import type { FileKind, FileRecord } from '@/db/filesRepo';
import { makeStyles, useTheme } from '@/theme';
import { formatListDate } from '@/utils/formatDate';
import { formatFileSize } from '@/utils/fileSize';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { Icon } from './Icon';

const KIND_LABEL: Record<FileKind, string> = { pdf: 'PDF', docx: 'DOC', txt: 'TXT', other: 'FILE' };

export function FileTypeTile({ kind, size = 'md' }: { kind: FileKind; size?: 'md' | 'lg' }) {
  const theme = useTheme();
  const { background, foreground } = theme.colors.fileTypes[kind];
  const lg = size === 'lg';
  return (
    <View
      accessible={false}
      style={{
        width: lg ? 56 : 46,
        height: lg ? 64 : 52,
        borderRadius: 10,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText style={{ color: foreground, fontFamily: theme.fonts.displayBold, fontSize: lg ? 13 : 11, letterSpacing: 0.4 }}>
        {KIND_LABEL[kind]}
      </AppText>
    </View>
  );
}

/** Human status line: "Text ready", "Reading text… 40%", "Scanned: needs OCR". */
export function extractionLabel(file: FileRecord, progress?: number): { text: string; tone: 'ok' | 'busy' | 'warn' } {
  if (file.extractionStatus === 'pending') {
    return { text: progress !== undefined ? `Reading text… ${Math.round(progress * 100)}%` : 'Reading text…', tone: 'busy' };
  }
  if (file.extractionStatus === 'failed') {
    if (file.extractionError === 'scanned') return { text: 'Scanned: no text found, needs OCR', tone: 'warn' };
    if (file.extractionError === 'encrypted') return { text: 'Password-protected: can’t read text', tone: 'warn' };
    return { text: 'Couldn’t read the text', tone: 'warn' };
  }
  if (file.textLength === 0) return { text: 'No text', tone: 'warn' };
  return { text: 'Text ready', tone: 'ok' };
}

type Props = {
  file: FileRecord;
  /** 0–1 while the file's text is being extracted */
  progress?: number;
  onPress: () => void;
  onLongPress?: () => void;
};

export function FileRow({ file, progress, onPress, onLongPress }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const status = extractionLabel(file, progress);
  const meta = [
    formatFileSize(file.size),
    file.pageCount ? `${file.pageCount} ${file.pageCount === 1 ? 'page' : 'pages'}` : null,
    formatListDate(file.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${file.name}. ${meta}. ${status.text}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <FileTypeTile kind={file.kind} />
      <View style={styles.text}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {file.name}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {meta}
        </AppText>
        {status.tone === 'busy' ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((progress ?? 0.05) * 100)}%` }]} />
          </View>
        ) : null}
        {status.tone !== 'ok' || file.createdBy !== 'ai' ? (
          <View style={styles.status}>
            {status.tone === 'ok' ? (
              <Icon name="check" size={12} strokeWidth={2.4} color={theme.colors.success} />
            ) : null}
            <AppText variant="caption" color={status.tone === 'warn' ? 'private' : 'textMuted'}>
              {status.text}
            </AppText>
          </View>
        ) : null}
      </View>
      {file.createdBy === 'ai' ? <Badge kind="ai" /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 10,
    borderRadius: t.radius.lg,
  },
  pressed: { backgroundColor: t.colors.surface },
  text: { flex: 1, minWidth: 0, gap: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: t.colors.neutralBadge, marginVertical: 3 },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: t.colors.accent },
}));
