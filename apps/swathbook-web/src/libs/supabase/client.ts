/**
 * client.ts
 *
 * Supabase client for Client Components. Shares the cookie session set on the server.
 *
 * @module src/libs/supabase/client
 * @since 1.0.0
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export function createClient() {
    const { url, publishableKey } = getSupabaseEnv();
    return createBrowserClient<Database>(url, publishableKey);
}
