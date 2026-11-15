import { createClient } from '@supabase/supabase-js';
import { deviceStorage } from '@swathbook/mobile/device-storage';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/data/database.types';

import { config } from './config';

/**
 * The app's Supabase client. It talks to the database as the signed-in team
 * member, so Row Level Security and the database functions decide what they
 * can see and do: the same rules as the web dashboard. Only refunds go
 * through the web app (/api/owner), which holds the Stripe keys.
 *
 * When the env vars are missing it still constructs (so imports never throw);
 * the root layout shows a setup message instead of the app.
 */
export const supabase = createClient<Database>(config.supabaseUrl || 'http://localhost:54321', config.supabasePublishableKey || 'missing-key', {
  auth: {
    // The iOS Keychain / Android Keystore. A different key from the customer
    // app's, so the two never share a session on one device.
    storage: deviceStorage,
    storageKey: 'swathbook-business-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only in the foreground (Supabase's guidance for React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
