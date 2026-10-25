/**
 * stripe-billing.ts
 *
 * Subscriptions on the Swathbook platform account (separate from the
 * businesses' own connected accounts, which take customer payments).
 * Checkout starts a plan, the billing portal manages it, and the webhook keeps
 * public.subscriptions in step with Stripe.
 *
 * @module src/libs/billing/stripe-billing
 * @since 1.0.0
 */

import type Stripe from "stripe";
import type { createAdminClient } from "@/libs/supabase/admin";
import type { Database } from "@/libs/supabase/database.types";
import { PLANS, isPaidPlan, planForLookupKey, type PaidPlan } from "./plans";

type Admin = ReturnType<typeof createAdminClient>;
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

const priceCache = new Map<PaidPlan, string>();

/** The monthly price for a plan, created in Stripe the first time it's needed. */
export async function priceIdFor(stripe: Stripe, plan: PaidPlan) {
    const cached = priceCache.get(plan);
    if (cached) return cached;
    const config = PLANS[plan];
    const { data } = await stripe.prices.list({ lookup_keys: [config.lookupKey], active: true, limit: 1 });
    let price = data[0];
    if (!price) {
        price = await stripe.prices.create(
            {
                currency: "usd",
                unit_amount: config.priceCents,
                recurring: { interval: "month" },
                lookup_key: config.lookupKey,
                product_data: { name: `Swathbook ${config.name}`, metadata: { plan } },
                metadata: { plan },
            },
            { idempotencyKey: `price:${config.lookupKey}:${config.priceCents}` },
        );
    }
    priceCache.set(plan, price.id);
    return price.id;
}

export function resetPriceCache() {
    priceCache.clear();
}

type BillingBusiness = { id: string; name: string; stripe_customer_id: string | null; trial_ends_at: string | null };

/** The business's customer on the platform account, created once. */
export async function ensureCustomer(stripe: Stripe, admin: Admin, business: BillingBusiness, email: string) {
    if (business.stripe_customer_id) return business.stripe_customer_id;
    const customer = await stripe.customers.create(
        { name: business.name, email, metadata: { business_id: business.id } },
        { idempotencyKey: `billing-customer:${business.id}` },
    );
    const { error } = await admin.from("businesses").update({ stripe_customer_id: customer.id }).eq("id", business.id);
    if (error) throw error;
    return customer.id;
}

/** Stripe needs a trial end at least 48 hours out; shorter remainders just start billing now. */
export function remainingTrialEnd(trialEndsAt: string | null, now = Date.now()) {
    if (!trialEndsAt) return undefined;
    const end = Date.parse(trialEndsAt);
    return end - now > 48 * 3_600_000 ? Math.floor(end / 1000) : undefined;
}

export async function createCheckoutSession(
    stripe: Stripe,
    admin: Admin,
    { business, plan, email, returnUrl }: { business: BillingBusiness; plan: PaidPlan; email: string; returnUrl: string },
) {
    const customer = await ensureCustomer(stripe, admin, business, email);
    const trialEnd = remainingTrialEnd(business.trial_ends_at);
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: business.id,
        line_items: [{ price: await priceIdFor(stripe, plan), quantity: 1 }],
        // Subscribing mid-trial keeps the rest of the free days.
        subscription_data: { metadata: { business_id: business.id, plan }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
        metadata: { business_id: business.id, plan },
        allow_promotion_codes: true,
        success_url: `${returnUrl}?checkout=success`,
        cancel_url: `${returnUrl}?checkout=canceled`,
    });
    return session.url;
}

export async function createPortalSession(stripe: Stripe, customer: string, returnUrl: string) {
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
    return session.url;
}

function iso(seconds: number | null | undefined) {
    return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** Mirrors a Stripe subscription into public.subscriptions. */
export async function syncSubscription(admin: Admin, subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    let businessId: string | null = subscription.metadata?.business_id ?? null;
    if (!businessId) {
        const { data } = await admin.from("businesses").select("id").eq("stripe_customer_id", customerId).maybeSingle();
        businessId = data?.id ?? null;
    }
    if (!businessId) throw new Error(`No business for subscription ${subscription.id}`);

    const item = subscription.items.data[0];
    const plan = isPaidPlan(subscription.metadata?.plan) ? subscription.metadata.plan : planForLookupKey(item?.price.lookup_key);
    if (!plan) throw new Error(`Unknown plan on subscription ${subscription.id}`);

    const { error } = await admin.from("subscriptions").upsert(
        {
            business_id: businessId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            stripe_price_id: item?.price.id ?? null,
            plan,
            status: subscription.status as SubscriptionStatus,
            current_period_start: iso(item?.current_period_start),
            current_period_end: iso(item?.current_period_end),
            trial_end: iso(subscription.trial_end),
            cancel_at_period_end: subscription.cancel_at_period_end,
            canceled_at: iso(subscription.canceled_at),
            ended_at: iso(subscription.ended_at),
        },
        { onConflict: "stripe_subscription_id" },
    );
    if (error) throw error;
    return { businessId, plan, status: subscription.status };
}
