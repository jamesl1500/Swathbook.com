import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { motion } from '../tokens';

const riseEasing = Easing.bezier(0.2, 0.7, 0.2, 1);

/**
 * Fades content up into place when it first mounts: the website's
 * `animate-rise`. Stagger siblings with `delay`. Reanimated skips the motion
 * when the device has Reduce Motion on.
 */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.riseMs).delay(delay).easing(riseEasing)} style={style}>
      {children}
    </Animated.View>
  );
}
