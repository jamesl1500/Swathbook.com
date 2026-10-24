/**
 * env.ts
 *
 * Supabase connection settings. Both values are safe to expose to the browser;
 * Row Level Security is what protects the data.
 *
 * @module src/libs/supabase/env
 * @since 1.0.0
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function hasSupabaseEnv() {
    return Boolean(url && publishableKey);
}

export function getSupabaseEnv() {
    if (!url || !publishableKey) {
        throw new Error(
            "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/swathbook-web/.env (see .env.example).",
        );
    }
    return { url, publishableKey };
}
