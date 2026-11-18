/**
 * rate-limit.ts
 *
 * Limits for the public server actions anyone can call (placing a booking,
 * address lookups that call paid Google APIs). Counts live in Postgres (see
 * hit_rate_limit()), keyed by the action and a hash of the client's IP, so no
 * raw IPs are stored.
 *
 * Fails open: if the limiter itself can't answer, the request goes through.
 * A broken counter should never cost a business a real booking.
 *
 * @module src/libs/rate-limit
 * @since 1.0.0
 */

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";

export type RateLimit = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
    /** Places autocomplete, as someone types (already debounced in the browser). */
    addressSuggest: { limit: 120, windowSeconds: 600 },
    /** Places details, once per picked suggestion. */
    addressResolve: { limit: 40, windowSeconds: 600 },
    /** Geocoding plus signed satellite links on the booking page's "Where" step. */
    locate: { limit: 30, windowSeconds: 600 },
    /** Bookings placed on one business's page from one place. */
    booking: { limit: 8, windowSeconds: 600 },
} satisfies Record<string, RateLimit>;

export const RATE_LIMITED_MESSAGE = "Too many tries. Wait a few minutes, then try again.";

/**
 * The visitor's IP as the hosting platform reports it. x-real-ip is set by
 * the platform's edge; the first x-forwarded-for entry is the client as the
 * first proxy saw it.
 */
export function clientIp(requestHeaders: Pick<Headers, "get">) {
    const real = requestHeaders.get("x-real-ip")?.trim();
    if (real) return real;
    const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || null;
}

export function bucketFor(action: string, identity: string, scope?: string) {
    // Hashed so the table never holds an IP address (or a user id).
    const who = createHash("sha256").update(`swathbook:rate:${identity}`).digest("base64url").slice(0, 22);
    return [action, scope, who].filter(Boolean).join(":").slice(0, 200);
}

/**
 * Counts this request against `action`'s limit. True when it may go ahead.
 * `scope` narrows the bucket (e.g. a business slug) so one visitor can't use
 * up another business's allowance. `identity` counts a signed-in user
 * instead of their IP.
 */
export async function allowRequest(
    action: keyof typeof RATE_LIMITS,
    { scope, identity }: { scope?: string; identity?: string } = {},
): Promise<boolean> {
    if (!hasAdminClient()) return true;
    const who = identity ? `user:${identity}` : clientIp(await headers());
    if (!who) return true;
    const { limit, windowSeconds } = RATE_LIMITS[action];
    const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
        p_bucket: bucketFor(action, who, scope),
        p_limit: limit,
        p_window_seconds: windowSeconds,
    });
    if (error) {
        console.error(`[rate-limit] couldn't check ${action}`, error.message);
        return true;
    }
    return data !== false;
}
