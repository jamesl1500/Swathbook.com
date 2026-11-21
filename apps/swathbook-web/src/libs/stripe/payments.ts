/**
 * payments.ts
 *
 * Collecting money for a booking: a PaymentIntent created as a direct charge on
 * the business's connected account, mirrored as a row in `payments`. The
 * webhook (see webhooks.ts) moves that row forward; database triggers then
 * update the booking's totals and confirm it once the deposit lands.
 *
 * @module src/libs/stripe/payments
 * @since 1.0.0
 */

import type Stripe from "stripe";
import type { createAdminClient } from "@/libs/supabase/admin";
import { swathbookFeeCents } from "@/libs/billing/fees";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PaymentKind = "deposit" | "balance" | "tip";

/** Tips: at least $1, and up to $100 or the job's total, whichever is more. */
export const MIN_TIP_CENTS = 100;
export function maxTipCents(jobTotalCents: number) {
    return Math.max(10_000, jobTotalCents);
}
/** How long after a job the report still offers a tip. */
export const TIP_WINDOW_DAYS = 30;

export type PaymentSession = {
    clientSecret: string;
    stripeAccountId: string;
    amountCents: number;
    kind: PaymentKind;
};

export type PaymentSessionError = { error: string };

/** What's owed right now for `kind`, in cents (a tip is whatever the customer picks). */
export function amountDue(
    booking: { deposit_due_cents: number; deposit_paid_cents: number; balance_due_cents: number | null },
    kind: Exclude<PaymentKind, "tip">,
) {
    if (kind === "deposit") return Math.max(0, booking.deposit_due_cents - booking.deposit_paid_cents);
    return Math.max(0, booking.balance_due_cents ?? 0);
}

/**
 * Returns a client secret for paying `kind` on a booking. Reuses an open
 * PaymentIntent for the same amount so refreshing the page doesn't create
 * duplicates.
 */
export async function createBookingPayment(
    stripe: Stripe,
    admin: AdminClient,
    { bookingId, kind, tipCents }: { bookingId: string; kind: PaymentKind; tipCents?: number },
): Promise<PaymentSession | PaymentSessionError> {
    const { data: booking } = await admin
        .from("bookings")
        .select(
            "id, business_id, customer_id, status, currency, deposit_due_cents, deposit_paid_cents, balance_due_cents, hold_expires_at, subtotal_cents, discount_cents, completed_at, customers(email), businesses(name, tips_enabled)",
        )
        .eq("id", bookingId)
        .maybeSingle();
    if (!booking) return { error: "We couldn't find that booking." };
    if (["cancelled", "no_show"].includes(booking.status)) return { error: "This booking was cancelled." };
    if (kind === "deposit" && booking.status === "pending_payment" && booking.hold_expires_at && new Date(booking.hold_expires_at) < new Date()) {
        return { error: "This time was held for 15 minutes and has been released. Please book again." };
    }

    let amountCents: number;
    if (kind === "tip") {
        if (booking.status !== "completed" || !booking.businesses?.tips_enabled) return { error: "Tips aren't open for this job." };
        if (booking.completed_at && Date.now() - Date.parse(booking.completed_at) > TIP_WINDOW_DAYS * 86_400_000) {
            return { error: "Tips for this job have closed." };
        }
        const jobTotal = booking.subtotal_cents - booking.discount_cents;
        if (!Number.isInteger(tipCents) || tipCents! < MIN_TIP_CENTS || tipCents! > maxTipCents(jobTotal)) {
            return { error: `Pick a tip between $1 and ${(maxTipCents(jobTotal) / 100).toFixed(0)} dollars.` };
        }
        amountCents = tipCents!;
    } else {
        amountCents = amountDue(booking, kind);
    }
    if (amountCents < 50) return { error: "Nothing to pay right now." };

    const { data: account } = await admin
        .from("stripe_connect_accounts")
        .select("stripe_account_id, charges_enabled")
        .eq("business_id", booking.business_id)
        .maybeSingle();
    if (!account?.charges_enabled) return { error: "This business isn't taking online payments yet." };

    const { data: open } = await admin
        .from("payments")
        .select("stripe_payment_intent_id")
        .eq("booking_id", booking.id)
        .eq("kind", kind)
        .eq("amount_cents", amountCents)
        .eq("status", "requires_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (open?.stripe_payment_intent_id) {
        const existing = await stripe.paymentIntents.retrieve(open.stripe_payment_intent_id, undefined, {
            stripeAccount: account.stripe_account_id,
        });
        if (existing.client_secret && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(existing.status)) {
            return { clientSecret: existing.client_secret, stripeAccountId: account.stripe_account_id, amountCents, kind };
        }
    }

    // Swathbook takes 1.25% of deposits and balances; tips go to the business in full.
    const applicationFee = kind === "tip" ? 0 : swathbookFeeCents(amountCents);
    // A second tip of the same amount is a new payment, not a retry of the first.
    const { count: earlierTips } =
        kind === "tip"
            ? await admin.from("payments").select("id", { count: "exact", head: true }).eq("booking_id", booking.id).eq("kind", "tip").neq("status", "requires_payment")
            : { count: 0 };
    const intent = await stripe.paymentIntents.create(
        {
            amount: amountCents,
            currency: booking.currency,
            automatic_payment_methods: { enabled: true },
            ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
            description: `${booking.businesses?.name ?? "Booking"}: ${kind}`,
            receipt_email: booking.customers?.email ?? undefined,
            metadata: { booking_id: booking.id, business_id: booking.business_id, kind },
        },
        {
            stripeAccount: account.stripe_account_id,
            idempotencyKey: `booking-payment:${booking.id}:${kind}:${amountCents}:${open ? "retry" : "first"}${kind === "tip" ? `:${earlierTips ?? 0}` : ""}`,
        },
    );

    const { error } = await admin.from("payments").insert({
        business_id: booking.business_id,
        booking_id: booking.id,
        customer_id: booking.customer_id,
        kind,
        status: "requires_payment",
        currency: booking.currency,
        amount_cents: amountCents,
        application_fee_cents: applicationFee,
        stripe_account_id: account.stripe_account_id,
        stripe_payment_intent_id: intent.id,
    });
    if (error && error.code !== "23505") throw new Error(`Couldn't record the payment: ${error.message}`);

    return { clientSecret: intent.client_secret!, stripeAccountId: account.stripe_account_id, amountCents, kind };
}
