import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  title: string;
  body?: string;
  children?: ReactNode;
};

export function EmptyState({ icon, title, body, children }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.tile}>
        <Icon name={icon} size={26} color={theme.colors.accent} />
      </View>
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" color="textMuted" style={styles.center}>
          {body}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.xxxl,
    paddingVertical: t.spacing.xxxl,
  },
  tile: {
    width: 64,
    height: 64,
    borderRadius: t.radius.xxl,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.spacing.xs,
  },
  center: { textAlign: 'center' },
}));
