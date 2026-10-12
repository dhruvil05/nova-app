import { View } from 'react-native';

import { makeStyles } from '@/theme';

/** Nova's logo: a ring with a dot. */
export function NovaMark({ size = 30 }: { size?: number }) {
  const styles = useStyles();
  const dot = Math.round(size / 3);
  return (
    <View
      accessible={false}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2 }]} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  ring: {
    borderWidth: 2,
    borderColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { backgroundColor: t.colors.accent },
}));
