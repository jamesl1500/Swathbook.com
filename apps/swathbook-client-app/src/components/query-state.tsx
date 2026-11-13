import { CircleAlert } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, colors, EmptyState, space } from '@/design-system';

/** Centered spinner while a screen's data loads. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.center} role="progressbar" aria-label={label}>
      <ActivityIndicator color={colors.brand600} />
    </View>
  );
}

/** When a load fails: say so, and offer a retry. */
export function LoadError({ onRetry, title = "Couldn't load this" }: { onRetry: () => void; title?: string }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={title}
      action={
        <Button variant="secondary" onPress={onRetry}>
          Try again
        </Button>
      }
    >
      Check your connection and try again.
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: space[16],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
