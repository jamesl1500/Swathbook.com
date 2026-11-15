/**
 * Runtime configuration from EXPO_PUBLIC_* env vars (see .env.example).
 * Expo inlines these at build time, which only works with direct
 * `process.env.EXPO_PUBLIC_…` reads, so don't destructure them.
 *
 * URLs go through checkBaseUrl: release builds only talk HTTPS, so a
 * misconfigured build shows the setup screen instead of sending a session in
 * the clear.
 */

import { checkBaseUrl } from '@swathbook/mobile/url';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

const supabaseUrl = checkBaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL, { dev }) ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const siteUrl = checkBaseUrl(process.env.EXPO_PUBLIC_SITE_URL || 'https://www.swathbook.com', { dev }) ?? '';

export const config = {
  supabaseUrl,
  supabasePublishableKey,
  /** The web app: /api/owner routes, and the full dashboard. */
  siteUrl,
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey && siteUrl),
} as const;

/** A page of the web app, e.g. webUrl('/dashboard/billing'). Only same-site paths. */
export function webUrl(path: string) {
  return path.startsWith('/') && !path.startsWith('//') ? `${config.siteUrl}${path}` : config.siteUrl;
}
