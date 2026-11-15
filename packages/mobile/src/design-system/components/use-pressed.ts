import { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

/**
 * Pressed state as plain state, for components that may be wrapped in
 * expo-router's `<Link asChild>`. Link hands its child to a Slot that merges
 * `style` as one flat object, so a child's style must be a single object
 * (StyleSheet.flatten), never an array or a `({ pressed }) => …` function;
 * on web those are silently dropped and the button loses its background.
 */
export function usePressed(handlers: {
  onPressIn?: ((event: GestureResponderEvent) => void) | null;
  onPressOut?: ((event: GestureResponderEvent) => void) | null;
}) {
  const [pressed, setPressed] = useState(false);
  return {
    pressed,
    onPressIn: (event: GestureResponderEvent) => {
      setPressed(true);
      handlers.onPressIn?.(event);
    },
    onPressOut: (event: GestureResponderEvent) => {
      setPressed(false);
      handlers.onPressOut?.(event);
    },
  };
}
