/**
 * server.ts
 *
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create a new client per request; never share one across requests.
 *
 * @module src/libs/supabase/server
 * @since 1.0.0
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export async function createClient() {
    // Supabase checks token expiry against the clock, which Cache Components
    // forbids while prerendering (including partial prefetches that can read
    // cookies). connection() keeps every Supabase-backed render request-time.
    await connection();
    const cookieStore = await cookies();
    const { url, publishableKey } = getSupabaseEnv();

    return createServerClient<Database>(url, publishableKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                } catch {
                    // Server Components can't write cookies. That's fine: the proxy
                    // refreshes the session before the page renders.
                }
            },
        },
    });
}
