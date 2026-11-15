/**
 * Runtime configuration from EXPO_PUBLIC_* env vars (see .env.example).
 * Expo inlines these at build time, which only works with direct
 * `process.env.EXPO_PUBLIC_…` reads, so don't destructure them.
 *
 * URLs are checked by checkBaseUrl: release builds only talk HTTPS, so a
 * misconfigured build shows the setup screen instead of sending sessions in
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
  /** The web app: /api/app routes, booking pages (payments), help pages. */
  siteUrl,
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey && siteUrl),
} as const;

const ASSET_PATH = /^[\w-]+(?:\/[\w.-]+)+$/;

/** Public URL of a file in the business-assets bucket (logos, covers, photos). */
export function assetUrl(path: string | null | undefined) {
  // Paths come from the database; refuse anything that could climb out of the bucket.
  return path && config.supabaseUrl && ASSET_PATH.test(path) && !path.includes('..')
    ? `${config.supabaseUrl}/storage/v1/object/public/business-assets/${path}`
    : null;
}

const TOKEN = /^[0-9a-f]{64}$/;

/** The customer's page for a booking on the web, where deposits and balances are paid. */
export const manageBookingUrl = (token: string) => (TOKEN.test(token) ? `${config.siteUrl}/booking/${token}` : config.siteUrl);
