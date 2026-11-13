import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../tokens';
import { Text } from './text';

/**
 * Where someone is in a short multi-step flow: one bar per step, filled navy
 * up to the current one, with "Step 2 of 3" above. `current` is 0-based.
 */
export function StepProgress({
  total,
  current,
  tone = 'ink',
  style,
}: {
  total: number;
  current: number;
  /** `paper` for navy backgrounds. */
  tone?: 'ink' | 'paper';
  style?: StyleProp<ViewStyle>;
}) {
  const label = `Step ${current + 1} of ${total}`;
  const done = tone === 'paper' ? colors.sun : colors.brand600;
  const todo = tone === 'paper' ? 'rgba(255, 255, 255, 0.2)' : colors.line;
  return (
    <View
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      style={[styles.wrap, style]}
    >
      <Text variant="label" tone={tone === 'paper' ? 'sky' : 'faint'} aria-hidden>
        {label}
      </Text>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: i <= current ? done : todo }]} />
        ))}
      </View>
    </View>
  );
}

/** Small dots for swipeable panels (the welcome intro). `current` is 0-based. */
export function PageDots({ total, current, tone = 'ink' }: { total: number; current: number; tone?: 'ink' | 'paper' }) {
  const on = tone === 'paper' ? colors.sun : colors.brand600;
  const off = tone === 'paper' ? 'rgba(255, 255, 255, 0.3)' : colors.lineStrong;
  return (
    <View style={styles.dots} role="progressbar" aria-label={`Page ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i === current && styles.dotActive, { backgroundColor: i === current ? on : off }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space[2],
  },
  bars: {
    flexDirection: 'row',
    gap: space[1.5],
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  dotActive: {
    width: 24,
  },
});
