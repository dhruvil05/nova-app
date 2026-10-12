import { Pressable, View } from 'react-native';

import type { Note } from '@/db/notesRepo';
import { makeStyles } from '@/theme';
import { formatListDate } from '@/utils/formatDate';

import { AppText } from './AppText';
import { Badge } from './Badge';

type Props = {
  note: Note;
  /** Search snippet to show instead of the start of the body */
  snippet?: string;
  onPress: () => void;
};

export function NoteCard({ note, snippet, onPress }: Props) {
  const styles = useStyles();
  const title = note.title.trim() || 'Untitled';
  const preview = (snippet ?? note.body).replace(/\s+/g, ' ').trim();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the note"
      onPress={onPress}
      style={({ pressed }) => [styles.card, note.isPrivate && styles.private, pressed && styles.pressed]}>
      <View style={styles.top}>
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        <View style={styles.badges}>
          {note.isPrivate ? <Badge kind="private" /> : null}
          <Badge kind={note.createdBy === 'ai' ? 'ai' : 'user'} />
        </View>
      </View>
      {preview ? (
        <AppText variant="small" color={note.isPrivate ? 'privateText' : 'textSecondary'} numberOfLines={2}>
          {preview}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textFaint">
        {formatListDate(note.updatedAt)}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: 14,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  private: { backgroundColor: t.colors.privateSurface, borderColor: t.colors.privateBorder },
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  title: { flex: 1 },
  badges: { flexDirection: 'row', gap: t.spacing.xs },
}));
