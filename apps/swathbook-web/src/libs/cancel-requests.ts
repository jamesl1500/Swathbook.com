/**
 * cancel-requests.ts
 *
 * Answering a customer's cancellation request, and refunding what they paid.
 * Shared by the dashboard (Server Actions, cookie session) and the owner app
 * (POST /api/owner/bookings/:id/cancel-request, bearer token). `supabase`
 * acts as the signed-in person, so RLS and resolve_cancel_request decide what
 * they may do; Stripe calls stay on the server.
 *
 * @module src/libs/cancel-requests
 * @since 1.0.0
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, hasStripe } from "./stripe/server";
import { createAdminClient } from "./supabase/admin";
import type { Database } from "./supabase/database.types";

type Client = SupabaseClient<Database>;
export type Actor = { businessId: string; userId: string };

/** Refunds what's left on one payment. Returns a message on failure, null on success. */
export async function refundRemaining(supabase: Client, actor: Actor, paymentId: string): Promise<string | null> {
    const { data: payment } = await supabase
        .from("payments")
        .select("id, business_id, amount_cents, amount_refunded_cents, stripe_payment_intent_id, stripe_account_id, status")
        .eq("id", paymentId)
        .eq("business_id", actor.businessId)
        .maybeSingle();
    if (!payment?.stripe_payment_intent_id || !["succeeded", "partially_refunded"].includes(payment.status)) {
        return "That payment can't be refunded.";
    }
    const remaining = payment.amount_cents - payment.amount_refunded_cents;
    if (remaining <= 0) return "That payment is already fully refunded.";

    try {
        const refund = await getStripe().refunds.create(
            // The business wasn't paid, so Swathbook's fee goes back too (Stripe returns it pro rata).
            {
                payment_intent: payment.stripe_payment_intent_id,
                amount: remaining,
                reason: "requested_by_customer",
                refund_application_fee: true,
                metadata: { refunded_by: actor.userId },
            },
            { stripeAccount: payment.stripe_account_id, idempotencyKey: `refund:${payment.id}:${remaining}` },
        );
        await createAdminClient()
            .from("refunds")
            .upsert(
                {
                    business_id: actor.businessId,
                    payment_id: payment.id,
                    amount_cents: refund.amount,
                    status: refund.status === "succeeded" ? "succeeded" : "pending",
                    reason: "requested_by_customer",
                    stripe_refund_id: refund.id,
                    created_by: actor.userId,
                },
                { onConflict: "stripe_refund_id" },
            );
    } catch (error) {
        console.error("[refunds] refund failed", error);
        return "Stripe couldn't refund that payment.";
    }
    return null;
}

export type CancelDecision = { bookingId: string; approve: boolean; refund: boolean; note?: string };

/**
 * Approves (optionally refunding what was paid) or declines a cancellation
 * request. The caller queues the emails afterwards (sendQueuedEmailsSoon).
 */
export async function resolveCancelRequest(
    supabase: Client,
    actor: Actor,
    { bookingId, approve, refund, note }: CancelDecision,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
    const { error } = await supabase.rpc("resolve_cancel_request", {
        p_booking_id: bookingId,
        p_approve: approve,
        p_note: note || undefined,
    });
    if (error) {
        return { ok: false, error: error.message.includes("no_cancel_request") ? "That request was already answered." : "We couldn't update the booking." };
    }

    let refundNote = "";
    if (approve && refund && hasStripe()) {
        const { data: payments } = await supabase
            .from("payments")
            .select("id")
            .eq("booking_id", bookingId)
            .eq("business_id", actor.businessId)
            .in("status", ["succeeded", "partially_refunded"]);
        const failures = (await Promise.all((payments ?? []).map((payment) => refundRemaining(supabase, actor, payment.id)))).filter(Boolean);
        refundNote = payments?.length ? (failures.length ? " The refund didn't go through; try it from Payments." : " Refund started.") : "";
    }

    return {
        ok: true,
        message: approve
            ? `Booking cancelled. The customer has been emailed.${refundNote}`
            : "Request declined. The booking stays on and the customer has been emailed.",
    };
}
