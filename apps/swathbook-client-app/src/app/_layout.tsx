import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Settings } from 'lucide-react-native';
import { useEffect } from 'react';

import { queryClient } from '@/data/api';
import { AuthProvider, useAuth } from '@/data/auth';
import { loadIntroState, useIntroState } from '@/data/intro';
import { EmptyState, navigationTheme, Screen, stackScreenOptions, useBrandFonts } from '@/design-system';
import { config } from '@/lib/config';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="dark" />
          <App />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function App() {
  const fontsReady = useBrandFonts();
  const { ready: authReady } = useAuth();
  const intro = useIntroState();
  const ready = fontsReady && authReady && intro.ready;

  useEffect(() => {
    void loadIntroState();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Hold the splash screen until fonts, the saved session and the intro flag
  // are in, so nothing jumps and nobody sees the wrong first screen.
  if (!ready) return null;

  if (!config.isConfigured) {
    return (
      <Screen>
        <EmptyState icon={Settings} title="Swathbook isn't set up">
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to apps/swathbook-client-app/.env.local (see
          .env.example), then restart the dev server.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="business/[slug]" options={{ title: '' }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
      <Stack.Screen name="book/[slug]" options={{ title: 'Book a time', presentation: 'modal' }} />
      <Stack.Screen name="reschedule/[id]" options={{ title: 'Pick a new time', presentation: 'modal' }} />
      <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
      <Stack.Screen name="setup" options={{ title: 'Set up your account', presentation: 'modal' }} />
      <Stack.Screen name="edit-details" options={{ title: 'Your details', presentation: 'modal' }} />
      <Stack.Screen name="design-system" options={{ title: 'Design system' }} />
    </Stack>
  );
}
