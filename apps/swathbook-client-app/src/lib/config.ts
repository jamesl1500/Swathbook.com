/**
 * Runtime configuration from EXPO_PUBLIC_* env vars (see .env.example).
 * Expo inlines these at build time, which only works with direct
 * `process.env.EXPO_PUBLIC_…` reads, so don't destructure them.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://www.swathbook.com').replace(/\/$/, '');

export const config = {
  supabaseUrl,
  supabasePublishableKey,
  /** The web app: /api/app routes, booking pages (payments), help pages. */
  siteUrl,
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
} as const;

/** Public URL of a file in the business-assets bucket (logos, covers, photos). */
export function assetUrl(path: string | null | undefined) {
  return path && config.supabaseUrl ? `${config.supabaseUrl}/storage/v1/object/public/business-assets/${path}` : null;
}

/** The customer's page for a booking on the web, where deposits and balances are paid. */
export const manageBookingUrl = (token: string) => `${config.siteUrl}/booking/${token}`;
