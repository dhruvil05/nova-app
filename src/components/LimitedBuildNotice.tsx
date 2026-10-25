import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Explains that a feature is off because Nova is running in Expo Go. */
export function LimitedBuildNotice({ text }: { text: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.box} accessibilityRole="text">
      <Icon name="lock" size={16} color={theme.colors.private} />
      <AppText variant="small" color="privateText" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    alignItems: 'flex-start',
    padding: t.spacing.md,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.privateSurface,
    borderWidth: 1,
    borderColor: t.colors.privateBorder,
  },
  text: { flex: 1 },
}));
