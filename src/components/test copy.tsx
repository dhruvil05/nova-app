import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { MiniPlayer } from './MiniPlayer';

const TAB_ICONS: Record<string, IconName> = {
  index: 'sparkles',
  notes: 'note',
  music: 'music',
  files: 'folder',
};

/** Bottom tab bar from the UI canvas: label under icon, pill behind the active icon. */
export function testCopy2({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.wrap}>
      <MiniPlayer />
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const color = focused ? theme.colors.accent : theme.colors.textFaint;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}>
            <View style={[styles.pill, focused && styles.pillActive]}>
              <Icon name={TAB_ICONS[route.name] ?? 'sparkles'} size={22} color={color} />
            </View>
            <AppText variant={focused ? 'label' : 'caption'} style={{ color }}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { backgroundColor: t.colors.background },
  bar: {
    flexDirection: 'row',
    backgroundColor: t.colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: t.spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: t.spacing.xs, minHeight: t.touchTarget },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: t.colors.accentSoft },
}));
