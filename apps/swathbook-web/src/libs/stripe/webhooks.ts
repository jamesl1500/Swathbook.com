/**
 * webhooks.ts
 *
 * Handles Stripe thin events: connected-account payments and onboarding, plus
 * Swathbook's own subscriptions on the platform account. Each event is recorded once in stripe_webhook_events; the handler
 * then re-fetches the current object from Stripe rather than trusting a
 * snapshot, and mirrors it into payments / refunds / stripe_connect_accounts.
 *
 * @module src/libs/stripe/webhooks
 * @since 1.0.0
 */

import type Stripe from "stripe";
import type { createAdminClient } from "@/libs/supabase/admin";
import type { Database } from "@/libs/supabase/database.types";
import { syncSubscription } from "@/libs/billing/stripe-billing";
import { syncConnectAccount } from "./connect";

type AdminClient = ReturnType<typeof createAdminClient>;
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type RefundStatus = Database["public"]["Enums"]["refund_status"];

export type ThinEvent = {
    id: string;
    type: string;
    created?: string;
    livemode?: boolean;
    context?: unknown;
    related_object?: { id: string; type: string; url?: string } | null;
};

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

const ACCOUNT_EVENTS = new Set([
    "v2.core.account.updated",
    "v2.core.account[requirements].updated",
    "v2.core.account[configuration.merchant].updated",
    "v2.core.account[configuration.merchant].capability_status_updated",
]);

const PAYMENT_INTENT_EVENTS = new Set([
    "v1.payment_intent.succeeded",
    "v1.payment_intent.processing",
    "v1.payment_intent.payment_failed",
    "v1.payment_intent.canceled",
]);

const REFUND_EVENTS = new Set(["v1.refund.created", "v1.refund.updated", "v1.refund.failed"]);

// Swathbook's own plans, on the platform account (no connected-account context).
const SUBSCRIPTION_EVENTS = new Set([
    "v1.customer.subscription.created",
    "v1.customer.subscription.updated",
    "v1.customer.subscription.deleted",
    "v1.customer.subscription.paused",
    "v1.customer.subscription.resumed",
]);

export const SUBSCRIBED_EVENTS = [
    ...ACCOUNT_EVENTS,
    ...PAYMENT_INTENT_EVENTS,
    ...REFUND_EVENTS,
    "v1.charge.refunded",
    ...SUBSCRIPTION_EVENTS,
    "v1.checkout.session.completed",
];

export function paymentStatusFromIntent(status: Stripe.PaymentIntent.Status, hadFailure: boolean): PaymentStatus {
    switch (status) {
        case "succeeded":
            return "succeeded";
        case "processing":
            return "processing";
        case "canceled":
            return "canceled";
        default:
            return hadFailure ? "failed" : "requires_payment";
    }
}

export function refundStatusFromStripe(status: string | null): RefundStatus {
    if (status === "succeeded") return "succeeded";
    if (status === "failed") return "failed";
    if (status === "canceled") return "canceled";
    return "pending";
}

function accountOf(event: ThinEvent) {
    const context = event.context == null ? "" : String(event.context);
    return context.startsWith("acct_") ? context : null;
}

async function handlePaymentIntent(stripe: Stripe, admin: AdminClient, event: ThinEvent, account: string) {
    const intent = await stripe.paymentIntents.retrieve(event.related_object!.id, { expand: ["latest_charge"] }, { stripeAccount: account });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const card = charge?.payment_method_details?.card;

    const update = {
        status: paymentStatusFromIntent(intent.status, Boolean(intent.last_payment_error)),
        stripe_charge_id: charge?.id ?? null,
        payment_method_type: charge?.payment_method_details?.type ?? null,
        card_brand: card?.brand ?? null,
        card_last4: card?.last4 ?? null,
        failure_code: intent.last_payment_error?.code ?? null,
        failure_message: intent.last_payment_error?.message?.slice(0, 500) ?? null,
    };

    const { data: updated, error } = await admin
        .from("payments")
        .update(update)
        .eq("stripe_payment_intent_id", intent.id)
        .select("id");
    if (error) throw new Error(`payments update failed: ${error.message}`);
    if (updated.length) return;

    // A payment we didn't create through the app (e.g. retried elsewhere): record it if it's ours.
    const bookingId = intent.metadata?.booking_id;
    if (!bookingId) return;
    const { data: booking } = await admin.from("bookings").select("business_id, customer_id, currency").eq("id", bookingId).maybeSingle();
    if (!booking) return;
    const kind = intent.metadata?.kind === "deposit" ? "deposit" : "balance";
    const { error: insertError } = await admin.from("payments").insert({
        business_id: booking.business_id,
        booking_id: bookingId,
        customer_id: booking.customer_id,
        kind,
        currency: intent.currency,
        amount_cents: intent.amount,
        application_fee_cents: intent.application_fee_amount ?? 0,
        stripe_account_id: account,
        stripe_payment_intent_id: intent.id,
        ...update,
    });
    if (insertError && insertError.code !== "23505") throw new Error(`payments insert failed: ${insertError.message}`);
}

async function upsertRefund(admin: AdminClient, refund: Stripe.Refund) {
    const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    if (!paymentIntentId) return;
    const { data: payment } = await admin
        .from("payments")
        .select("id, business_id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
    if (!payment) return;

    const reason = ["requested_by_customer", "duplicate", "fraudulent"].includes(refund.reason ?? "") ? refund.reason! : "other";
    const { error } = await admin.from("refunds").upsert(
        {
            business_id: payment.business_id,
            payment_id: payment.id,
            amount_cents: refund.amount,
            status: refundStatusFromStripe(refund.status),
            reason,
            stripe_refund_id: refund.id,
        },
        { onConflict: "stripe_refund_id" },
    );
    if (error) throw new Error(`refunds upsert failed: ${error.message}`);
}

/**
 * Processes one verified event. Safe to call repeatedly with the same event:
 * duplicates are detected and skipped. Throws on failure so the route returns
 * 500 and Stripe retries.
 */
export async function handleStripeEvent(stripe: Stripe, admin: AdminClient, event: ThinEvent): Promise<WebhookOutcome> {
    const account = accountOf(event);

    const { data: inserted } = await admin
        .from("stripe_webhook_events")
        .upsert(
            {
                id: event.id,
                type: event.type,
                stripe_account_id: account,
                livemode: Boolean(event.livemode),
                payload: JSON.parse(JSON.stringify(event)),
            },
            { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id");
    if (!inserted?.length) {
        const { data: existing } = await admin.from("stripe_webhook_events").select("processed_at").eq("id", event.id).maybeSingle();
        if (existing?.processed_at) return "duplicate";
    }

    let outcome: WebhookOutcome = "ignored";
    try {
        if (ACCOUNT_EVENTS.has(event.type) && event.related_object?.id) {
            await syncConnectAccount(stripe, admin, event.related_object.id);
            outcome = "processed";
        } else if (PAYMENT_INTENT_EVENTS.has(event.type) && account && event.related_object?.id) {
            await handlePaymentIntent(stripe, admin, event, account);
            outcome = "processed";
        } else if (REFUND_EVENTS.has(event.type) && account && event.related_object?.id) {
            await upsertRefund(admin, await stripe.refunds.retrieve(event.related_object.id, undefined, { stripeAccount: account }));
            outcome = "processed";
        } else if (SUBSCRIPTION_EVENTS.has(event.type) && !account && event.related_object?.id) {
            await syncSubscription(admin, await stripe.subscriptions.retrieve(event.related_object.id));
            outcome = "processed";
        } else if (event.type === "v1.checkout.session.completed" && !account && event.related_object?.id) {
            // Sync right away so the billing page is current when the customer lands back on it.
            const session = await stripe.checkout.sessions.retrieve(event.related_object.id);
            if (session.mode === "subscription" && session.subscription) {
                const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
                await syncSubscription(admin, await stripe.subscriptions.retrieve(id));
            }
            outcome = "processed";
        } else if (event.type === "v1.charge.refunded" && account && event.related_object?.id) {
            const refunds = await stripe.refunds.list({ charge: event.related_object.id, limit: 100 }, { stripeAccount: account });
            for (const refund of refunds.data) await upsertRefund(admin, refund);
            outcome = "processed";
        }
    } catch (error) {
        const { data: row } = await admin.from("stripe_webhook_events").select("attempts").eq("id", event.id).maybeSingle();
        await admin
            .from("stripe_webhook_events")
            .update({ attempts: (row?.attempts ?? 0) + 1, last_error: error instanceof Error ? error.message.slice(0, 1000) : String(error) })
            .eq("id", event.id);
        throw error;
    }

    const { data: row } = await admin.from("stripe_webhook_events").select("attempts").eq("id", event.id).maybeSingle();
    await admin
        .from("stripe_webhook_events")
        .update({ processed_at: new Date().toISOString(), attempts: (row?.attempts ?? 0) + 1, last_error: null })
        .eq("id", event.id);
    return outcome;
}
