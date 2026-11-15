import { EmptyState, navigationTheme, Screen, stackScreenOptions, useBrandFonts } from '@swathbook/mobile/design-system';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Settings } from 'lucide-react-native';
import { useEffect } from 'react';

import { NoBusiness } from '@/components/no-business';
import { queryClient } from '@/data/api';
import { AuthProvider, useAuth } from '@/data/auth';
import { BusinessProvider, useBusiness } from '@/data/business';
import { useLiveBusiness } from '@/data/live';
import { config } from '@/lib/config';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BusinessProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            <App />
          </ThemeProvider>
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function App() {
  const fontsReady = useBrandFonts();
  const { ready: authReady, signedIn, user } = useAuth();
  const business = useBusiness();
  const ready = fontsReady && authReady && business.ready;

  // Every screen of the open business stays live while the app is open.
  useLiveBusiness(business.active?.id, user?.id);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Hold the splash screen until fonts, the saved session and the team's
  // businesses are in, so nobody sees the wrong first screen.
  if (!ready) return null;

  if (!config.isConfigured) {
    return (
      <Screen>
        <EmptyState icon={Settings} title="Swathbook isn't set up">
          Add EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and EXPO_PUBLIC_SITE_URL to apps/swathbook-owner-app/.env.local (see
          .env.example), then restart the dev server. Release builds only accept https:// URLs.
        </EmptyState>
      </Screen>
    );
  }

  if (signedIn && !business.active) return <NoBusiness error={business.error} onRetry={business.retry} />;

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Today' }} />
        <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
