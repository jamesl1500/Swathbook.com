/**
 * site-url.ts
 *
 * The absolute base URL for links that leave the app (auth emails, Stripe
 * redirects, share links). Prefers the configured site URL so a spoofed Host
 * header can't send people elsewhere.
 *
 * @module src/libs/site-url
 * @since 1.0.0
 */

import { headers } from "next/headers";

export async function getSiteUrl() {
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (configured) return configured.replace(/\/$/, "");

    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin");
    if (origin) return origin;

    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    return host ? `${protocol}://${host}` : "http://localhost:3000";
}
