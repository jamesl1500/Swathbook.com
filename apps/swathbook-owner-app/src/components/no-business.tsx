import { Button, EmptyState, Screen, space } from '@swathbook/mobile/design-system';
import * as WebBrowser from 'expo-web-browser';
import { Store } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { signOut } from '@/data/auth';
import { webUrl } from '@/lib/config';

/** Signed in, but this login doesn't run or work for a live business (yet). */
export function NoBusiness({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  return (
    <Screen>
      <EmptyState
        icon={Store}
        title={error ? "Couldn't load your business" : 'No business on this login yet'}
        action={
          <View style={styles.actions}>
            {error ? (
              <Button onPress={onRetry}>Try again</Button>
            ) : (
              <Button onPress={() => WebBrowser.openBrowserAsync(webUrl('/onboarding'))}>Set up on the website</Button>
            )}
            <Button variant="ghost" onPress={() => void signOut()}>
              Sign out
            </Button>
          </View>
        }
      >
        {error
          ? 'Check your connection and try again.'
          : 'Set up your business on swathbook.com, or ask the owner to invite you. Then sign in here to run your day.'}
      </EmptyState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space[2],
    alignItems: 'center',
  },
});
