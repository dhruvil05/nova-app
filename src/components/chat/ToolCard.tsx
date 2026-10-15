import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { describeTool } from '@/ai/transcript';
import { makeStyles, useTheme } from '@/theme';

import { AppText } from '../AppText';
import { Icon } from '../Icon';

type Props = {
  name: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  isError?: boolean;
};

/** "Created note: Meeting with Raj" card shown whenever the AI used a tool (spec 3.1). */
export function ToolCard({ name, input, result, isError }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const info = describeTool(name, input, result, isError);
  const running = result === undefined;
  const link = info.link;

  const open = link
    ? () => {
        if (link.pathname === '/player') router.push('/player');
        else router.push({ pathname: link.pathname, params: { id: String(link.id) } });
      }
    : undefined;

  return (
    <Pressable
      accessibilityRole={open ? 'button' : undefined}
      accessibilityLabel={`${info.label}${info.detail ? `: ${info.detail}` : ''}`}
      accessibilityHint={open ? 'Opens it' : undefined}
      disabled={!open}
      onPress={open}
      style={({ pressed }) => [styles.card, isError && styles.errorCard, pressed && styles.pressed]}>
      <View style={[styles.iconTile, isError && styles.errorTile]}>
        {running ? (
          <ActivityIndicator size="small" color={theme.colors.accent} />
        ) : (
          <Icon name={info.icon} size={18} color={isError ? theme.colors.private : theme.colors.accent} />
        )}
      </View>
      <View style={styles.text}>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {info.label}
        </AppText>
        {info.detail ? (
          <AppText variant="bodyMedium" numberOfLines={2}>
            {info.detail}
          </AppText>
        ) : null}
      </View>
      {open ? (
        <AppText variant="label" color="accent">
          Open
        </AppText>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 10,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.accentSoft,
  },
  errorCard: { borderColor: t.colors.privateBorder },
  pressed: { opacity: 0.8 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTile: { backgroundColor: t.colors.privateSoft },
  text: { flex: 1, minWidth: 0 },
}));
