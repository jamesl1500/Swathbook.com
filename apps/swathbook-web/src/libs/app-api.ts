/**
 * app-api.ts
 *
 * Plumbing for /api/app/*, the endpoints the customer app (Expo) calls.
 *
 * The app signs in with Supabase and sends its access token as
 * `Authorization: Bearer <jwt>`; there are no cookies. Each request gets a
 * Supabase client acting as that user, so the database's own checks (the
 * *_my_booking functions) decide what they may touch.
 *
 * CORS is open: requests carry a bearer token, never cookies, so another
 * site can't act as a user without already holding their token. Browsers
 * only need it for the app's web build.
 *
 * @module src/libs/app-api
 * @since 1.0.0
 */

import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { getSupabaseEnv, hasSupabaseEnv } from "./supabase/env";

export const appCorsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
} as const;

/** A JSON response the app (including its web build) can read. Never cached. */
export function appJson(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { ...appCorsHeaders, "Cache-Control": "no-store" } });
}

/** `{ error, code }` with a status. `error` is shown to the customer as is. */
export function appError(status: number, code: string, error: string) {
    return appJson({ error, code }, status);
}

export function appPreflight() {
    return new Response(null, { status: 204, headers: appCorsHeaders });
}

export type AppAuth = { user: User & { email: string }; supabase: SupabaseClient<Database> };

function bearerToken(request: Request) {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
    return match?.[1] ?? null;
}

/**
 * The signed-in customer, or a ready-to-return error response. Requires a
 * confirmed email: that's what links a login to bookings.
 */
export async function authenticateApp(request: Request): Promise<AppAuth | { response: Response }> {
    if (!hasSupabaseEnv()) return { response: appError(503, "unavailable", "Swathbook is unavailable right now.") };
    const token = bearerToken(request);
    if (!token) return { response: appError(401, "unauthenticated", "Sign in to continue.") };

    const { url, publishableKey } = getSupabaseEnv();
    const supabase = createSupabaseClient<Database>(url, publishableKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Verified by Supabase Auth, not just decoded, so revoked sessions fail.
    const { data, error } = await supabase.auth.getUser(token);
    const user = data.user;
    if (error || !user) return { response: appError(401, "unauthenticated", "Your session has expired. Sign in again.") };
    if (!user.email || !user.email_confirmed_at) {
        return { response: appError(403, "email_unconfirmed", "Confirm your email address to continue.") };
    }
    return { user: user as AppAuth["user"], supabase };
}

/** Parses a JSON body, or null if it isn't JSON. */
export async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return null;
    }
}
