/**
 * payment-return.ts
 *
 * Making sense of the page a customer lands on after paying. Stripe sends them
 * back to our return URL (`?paid=1`) with `payment_intent` and
 * `redirect_status` added, but the booking only changes once Stripe's webhook
 * reaches us, usually a few seconds later. Until then the page shows the
 * payment as being confirmed and refreshes itself.
 *
 * @module src/libs/payment-return
 * @since 1.0.0
 */

export type PaymentReturn = {
    /** The PaymentIntent the customer just completed, when Stripe said which. */
    intentId: string | null;
    /** Stripe already knows it failed (e.g. a declined card after 3-D Secure). */
    failed: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

const INTENT_ID = /^pi_[A-Za-z0-9]{8,255}$/;

/** Null unless this page load is the customer coming back from paying. */
export function readPaymentReturn(params: SearchParams): PaymentReturn | null {
    if (first(params.paid) !== "1") return null;
    const intent = first(params.payment_intent) ?? "";
    return {
        intentId: INTENT_ID.test(intent) ? intent : null,
        failed: first(params.redirect_status) === "requires_payment_method",
    };
}

export type PaymentReturnState =
    | { state: "none" }
    | { state: "confirming" }
    | { state: "failed" }
    | { state: "succeeded"; kind: string | null };

const SUCCEEDED = new Set(["succeeded", "refunded", "partially_refunded"]);
const FAILED = new Set(["failed", "canceled"]);

/**
 * Where the payment the customer just made stands, from what the webhook has
 * recorded so far. `payments` are this booking's own payment rows.
 */
export function paymentReturnState(
    paymentReturn: PaymentReturn | null,
    booking: { status: string; payments: Array<{ kind: string; status: string; stripe_payment_intent_id: string | null }> },
): PaymentReturnState {
    if (!paymentReturn) return { state: "none" };
    if (paymentReturn.failed) return { state: "failed" };

    const payment = paymentReturn.intentId ? booking.payments.find((row) => row.stripe_payment_intent_id === paymentReturn.intentId) : undefined;
    if (payment) {
        if (SUCCEEDED.has(payment.status)) return { state: "succeeded", kind: payment.kind };
        if (FAILED.has(payment.status)) return { state: "failed" };
        return { state: "confirming" };
    }
    // Stripe didn't say which payment (or it isn't this booking's): a held
    // booking is still waiting for its deposit; anything else has moved on.
    return booking.status === "pending_payment" ? { state: "confirming" } : { state: "succeeded", kind: null };
}
