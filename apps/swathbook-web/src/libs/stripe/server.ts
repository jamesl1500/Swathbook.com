/**
 * server.ts
 *
 * Stripe on the server. Connected accounts use Accounts v2 with the Express
 * Dashboard and Stripe-managed risk ("Managed Risk"), which Stripe currently
 * offers on a preview API version. Customer payments are direct charges on
 * each business's connected account.
 *
 * @module src/libs/stripe/server
 * @since 1.0.0
 */

import Stripe from "stripe";

/** Express Dashboard + Managed Risk on Accounts v2 requires this preview version. */
export const STRIPE_API_VERSION = "2026-09-30.preview";

let client: Stripe | null = null;

export function hasStripe() {
    return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("Missing STRIPE_SECRET_KEY. Add it to apps/swathbook-web/.env to enable payouts and payments.");
    }
    client ??= new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION as Stripe.StripeConfig["apiVersion"],
        appInfo: { name: "Swathbook", url: "https://www.swathbook.com" },
        maxNetworkRetries: 2,
    });
    return client;
}

/** For tests: drop the cached client so a new mock/env takes effect. */
export function resetStripeClient() {
    client = null;
}

/**
 * Swathbook's cut of a customer payment, in cents. Off by default
 * (STRIPE_PLATFORM_FEE_BPS=0); 100 bps = 1%.
 */
export function platformFeeCents(amountCents: number, basisPoints = Number(process.env.STRIPE_PLATFORM_FEE_BPS ?? 0)) {
    if (!Number.isFinite(basisPoints) || basisPoints <= 0) return 0;
    return Math.min(amountCents, Math.round((amountCents * Math.min(basisPoints, 10_000)) / 10_000));
}
