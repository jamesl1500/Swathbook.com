/**
 * proxy.ts
 *
 * Refreshes the Supabase session on every request and passes the fresh auth
 * cookies on to both Server Components and the browser.
 *
 * @module src/libs/supabase/proxy
 * @since 1.0.0
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
    const { url, publishableKey } = getSupabaseEnv();
    let response = NextResponse.next({ request });

    const supabase = createServerClient(url, publishableKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet, headers) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
            },
        },
    });

    // Don't run code between createServerClient and getClaims(): it's what
    // refreshes an expired token, and skipping it logs users out at random.
    const { data } = await supabase.auth.getClaims();

    return { response, userId: data?.claims?.sub ?? null };
}

/**
 * Redirect that keeps any refreshed auth cookies and no-cache headers from `from`.
 */
export function redirectWithSession(url: URL, from: NextResponse) {
    const redirect = NextResponse.redirect(url);
    from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    ["Cache-Control", "Expires", "Pragma"].forEach((header) => {
        const value = from.headers.get(header);
        if (value) redirect.headers.set(header, value);
    });
    return redirect;
}
