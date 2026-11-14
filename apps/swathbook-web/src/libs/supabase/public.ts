/**
 * public.ts
 *
 * A Supabase client with no session: it reads exactly what anonymous visitors
 * may read (search_businesses, business_trades, get_booking_page). It never
 * touches cookies, so results can live in a shared "use cache" entry, unlike
 * the cookie-bound client in server.ts.
 *
 * @module src/libs/supabase/public
 * @since 1.0.0
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export function createPublicClient() {
    const { url, publishableKey } = getSupabaseEnv();
    return createSupabaseClient<Database>(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
}
