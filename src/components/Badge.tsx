import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = { kind: 'ai' | 'user' | 'private' };

/** Shows who created an item (NOVA / YOU), or that it is private. */
export function Badge({ kind }: Props) {
  const theme = useTheme();
  const styles = useStyles();

  if (kind === 'ai') {
    return (
      <View style={[styles.badge, styles.ai]} accessibilityLabel="Created by Nova">
        <Icon name="sparkles" size={11} strokeWidth={2.2} color={theme.colors.accentSoftText} />
        <AppText variant="badge" color="accentSoftText">
          NOVA
        </AppText>
      </View>
    );
  }
  if (kind === 'private') {
    return (
      <View style={[styles.badge, styles.private]} accessibilityLabel="Private note">
        <Icon name="lock" size={11} strokeWidth={2.2} color={theme.colors.private} />
        <AppText variant="badge" color="private">
          PRIVATE
        </AppText>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.user]} accessibilityLabel="Created by you">
      <AppText variant="badge" color="neutralBadgeText">
        YOU
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
  },
  ai: { backgroundColor: t.colors.accentSoft },
  user: { backgroundColor: t.colors.neutralBadge },
  private: { backgroundColor: t.colors.privateSoft },
}));
