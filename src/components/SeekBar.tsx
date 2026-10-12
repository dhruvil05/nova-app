import { useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';

import { makeStyles } from '@/theme';
import { formatDuration } from '@/utils/trackName';

import { AppText } from './AppText';

type Props = {
  /** Seconds */
  position: number;
  /** Seconds; 0 while unknown */
  duration: number;
  onSeek: (seconds: number) => void;
};

const STEP_SECONDS = 10;

/** Drag or tap to seek. Screen readers can swipe up/down to move 10 s. */
export function SeekBar({ position, duration, onSeek }: Props) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const canSeek = duration > 0 && width > 0;
  const fraction = dragFraction ?? (duration > 0 ? Math.min(position / duration, 1) : 0);

  function fractionAt(e: GestureResponderEvent): number {
    return Math.min(Math.max(e.nativeEvent.locationX / width, 0), 1);
  }

  return (
    <View style={styles.wrap}>
      <View
        style={styles.touchArea}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => canSeek}
        onMoveShouldSetResponder={() => canSeek}
        onResponderGrant={(e) => setDragFraction(fractionAt(e))}
        onResponderMove={(e) => setDragFraction(fractionAt(e))}
        onResponderRelease={(e) => {
          onSeek(fractionAt(e) * duration);
          setDragFraction(null);
        }}
        onResponderTerminate={() => setDragFraction(null)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Song position"
        accessibilityValue={{ text: `${formatDuration(position * 1000)} of ${formatDuration(duration * 1000)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const delta = e.nativeEvent.actionName === 'increment' ? STEP_SECONDS : -STEP_SECONDS;
          onSeek(Math.min(Math.max(position + delta, 0), duration));
        }}>
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, dragFraction !== null && styles.thumbActive, { left: fraction * width - 7 }]}
        />
      </View>
      <View style={styles.times}>
        <AppText variant="caption" color="textMuted">
          {formatDuration((dragFraction !== null ? dragFraction * duration : position) * 1000)}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {duration > 0 ? formatDuration(duration * 1000) : '–:––'}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.xs },
  touchArea: { height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: t.colors.borderStrong, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: t.colors.text },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: t.colors.text,
  },
  thumbActive: { transform: [{ scale: 1.3 }] },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
}));
