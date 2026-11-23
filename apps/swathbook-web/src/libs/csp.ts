/**
 * csp.ts
 *
 * The Content-Security-Policy every page is served with (see next.config.ts).
 *
 * Why not nonces: a nonce has to be new on every response, which makes every
 * page render per request. That would undo the static shells and the cached
 * booking page. So scripts allow 'unsafe-inline' (Next's own inline page
 * data needs it without nonces) but no eval in production, and every other
 * directive is an allow list: scripts, frames and connections only reach
 * this site, Supabase, Stripe and the Google tag, forms only post here, and nothing can
 * frame the site. That still blocks the usual XSS payloads that load a script
 * from elsewhere or send data off-site.
 *
 * Stripe's hosts are from https://docs.stripe.com/security/guide (Stripe.js,
 * the Payment Element with 3D Secure, and Link).
 *
 * @module src/libs/csp
 * @since 1.0.0
 */

const STRIPE = {
    script: ["https://js.stripe.com", "https://*.js.stripe.com", "https://maps.googleapis.com"],
    frame: ["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com", "https://link.com", "https://*.link.com"],
    connect: ["https://api.stripe.com", "https://maps.googleapis.com", "https://link.com", "https://*.link.com"],
    img: ["https://*.stripe.com", "https://*.link.com"],
    // Where a form posting here may end up (Checkout, the billing portal and
    // Connect onboarding), for the no-JavaScript fallback of server actions.
    formTargets: ["https://checkout.stripe.com", "https://billing.stripe.com", "https://connect.stripe.com"],
};

/** Google's weather condition icons on the rain planner. */
const WEATHER_ICONS = "https://maps.gstatic.com";

/** The Google tag on marketing pages (https://developers.google.com/tag-platform/security/guides/csp). */
const GOOGLE_TAG = {
    script: ["https://*.googletagmanager.com"],
    img: ["https://*.google-analytics.com", "https://*.googletagmanager.com"],
    connect: ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"],
};

export function buildContentSecurityPolicy({ supabaseUrl, dev = false }: { supabaseUrl?: string | null; dev?: boolean }) {
    const supabase = supabaseOrigins(supabaseUrl);
    // Upgrading only makes sense when everything is on https (not local Supabase).
    const allHttps = !dev && (!supabase || supabase.http.startsWith("https://"));

    const directives: Record<string, string[]> = {
        "default-src": ["'self'"],
        // React needs eval in development only, for its error overlays.
        "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...STRIPE.script, ...GOOGLE_TAG.script],
        // Inline style attributes (brand colors) and next/font's styles.
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", ...(supabase ? [supabase.http] : []), WEATHER_ICONS, ...STRIPE.img, ...GOOGLE_TAG.img],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", ...(supabase ? [supabase.http, supabase.ws] : []), ...STRIPE.connect, ...GOOGLE_TAG.connect],
        "frame-src": STRIPE.frame,
        "worker-src": ["'self'", "blob:"],
        "manifest-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'", ...STRIPE.formTargets],
        "frame-ancestors": ["'self'"],
    };
    const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
    if (allHttps) policy.push("upgrade-insecure-requests");
    return policy.join("; ");
}

function supabaseOrigins(url: string | null | undefined) {
    if (!url) return null;
    try {
        const { origin, protocol, host } = new URL(url);
        return { http: origin, ws: `${protocol === "https:" ? "wss" : "ws"}://${host}` };
    } catch {
        return null;
    }
}
