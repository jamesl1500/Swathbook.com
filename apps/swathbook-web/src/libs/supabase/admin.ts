/**
 * admin.ts
 *
 * Service-role Supabase client. It bypasses RLS, so use it only on the server
 * for work no user session can do: Stripe webhooks, public bookings
 * (create_booking is service-role only) and customer pay links.
 *
 * @module src/libs/supabase/admin
 * @since 1.0.0
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export function hasAdminClient() {
    return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
    if (typeof window !== "undefined") {
        throw new Error("createAdminClient() must never run in the browser.");
    }
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("Missing SUPABASE_SECRET_KEY. Add your project's secret key to apps/swathbook-web/.env (server only).");
    }
    const { url } = getSupabaseEnv();
    return createSupabaseClient<Database>(url, secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
