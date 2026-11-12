import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/data/database.types';

import { config } from './config';
import { deviceStorage } from './device-storage';

/**
 * The app's Supabase client. Talks to the database as the signed-in customer
 * (or anonymously), so Row Level Security and the customer functions decide
 * what it can see. Bookings are created through the web app's API instead
 * (appApi in data/api.ts), which needs the server's keys.
 *
 * When the env vars are missing it still constructs (so imports never throw);
 * the root layout shows a setup message instead of the app.
 */
export const supabase = createClient<Database>(
  config.supabaseUrl || 'http://localhost:54321',
  config.supabasePublishableKey || 'missing-key',
  {
    auth: {
      storage: deviceStorage,
      storageKey: 'swathbook-auth',
      autoRefreshToken: true,
      persistSession: true,
      // Sign-in is by emailed code, never by a redirect back into the app.
      detectSessionInUrl: false,
    },
  },
);

// Refresh tokens only while the app is in the foreground (Supabase's guidance
// for React Native); browsers handle this themselves.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
