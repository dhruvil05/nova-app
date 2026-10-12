import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { makeStyles } from '@/theme';

/** Files tab. Import and text extraction are built in Phase 3. */
export default function FilesScreen() {
  const styles = useStyles();
  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          Files
        </AppText>
      </View>
      <View style={styles.body}>
        <EmptyState
          icon="folder"
          title="Your documents"
          body="Importing PDF, DOCX and TXT files, so Nova can read them, arrives in Phase 3."
        />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  header: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg, minHeight: 60 },
  body: { flex: 1, justifyContent: 'center' },
}));
