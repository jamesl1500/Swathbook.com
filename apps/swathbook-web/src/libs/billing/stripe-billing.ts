/**
 * stripe-billing.ts
 *
 * Monthly plans bought before Swathbook moved to a per-payment fee. They live
 * on the platform account (separate from the businesses' connected accounts,
 * which take customer payments). Nothing new is sold: the billing portal lets
 * an owner cancel an old plan, and the webhook keeps public.subscriptions in
 * step with Stripe until it's gone.
 *
 * @module src/libs/billing/stripe-billing
 * @since 1.0.0
 */

import type Stripe from "stripe";
import type { createAdminClient } from "@/libs/supabase/admin";
import type { Database } from "@/libs/supabase/database.types";
import { isPaidPlan, planForLookupKey } from "./plans";

type Admin = ReturnType<typeof createAdminClient>;
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

/** Stripe's answer when an id doesn't exist in this account (for example, it was made with another account's keys). */
export function isMissingResource(error: unknown) {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "resource_missing";
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
