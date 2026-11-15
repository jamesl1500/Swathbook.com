import { describe, expect, it } from "vitest";
import { paymentReturnState, readPaymentReturn } from "./payment-return";

const INTENT = "pi_3QabcDEF12345678";

describe("readPaymentReturn", () => {
    it("is null unless the customer is back from paying", () => {
        expect(readPaymentReturn({})).toBeNull();
        expect(readPaymentReturn({ payment_intent: INTENT })).toBeNull();
    });

    it("reads Stripe's return parameters", () => {
        expect(readPaymentReturn({ paid: "1", payment_intent: INTENT, redirect_status: "succeeded" })).toEqual({ intentId: INTENT, failed: false });
        expect(readPaymentReturn({ paid: "1", payment_intent: INTENT, redirect_status: "requires_payment_method" })).toEqual({ intentId: INTENT, failed: true });
    });

    it("ignores a malformed intent id", () => {
        expect(readPaymentReturn({ paid: "1", payment_intent: "' or 1=1" })).toEqual({ intentId: null, failed: false });
    });
});

describe("paymentReturnState", () => {
    const deposit = (status: string) => ({ kind: "deposit", status, stripe_payment_intent_id: INTENT });
    const back = { intentId: INTENT, failed: false };

    it("is nothing when the customer didn't just pay", () => {
        expect(paymentReturnState(null, { status: "confirmed", payments: [] })).toEqual({ state: "none" });
    });

    it("waits while the webhook hasn't confirmed the payment", () => {
        expect(paymentReturnState(back, { status: "pending_payment", payments: [deposit("requires_payment")] })).toEqual({ state: "confirming" });
        expect(paymentReturnState(back, { status: "pending_payment", payments: [deposit("processing")] })).toEqual({ state: "confirming" });
    });

    it("is done once the payment succeeded, saying what it paid for", () => {
        expect(paymentReturnState(back, { status: "confirmed", payments: [deposit("succeeded")] })).toEqual({ state: "succeeded", kind: "deposit" });
        expect(
            paymentReturnState(back, { status: "confirmed", payments: [{ kind: "balance", status: "succeeded", stripe_payment_intent_id: INTENT }] }),
        ).toEqual({ state: "succeeded", kind: "balance" });
    });

    it("reports a failure, from Stripe's redirect or from the webhook", () => {
        expect(paymentReturnState({ intentId: INTENT, failed: true }, { status: "pending_payment", payments: [deposit("requires_payment")] })).toEqual({ state: "failed" });
        expect(paymentReturnState(back, { status: "pending_payment", payments: [deposit("failed")] })).toEqual({ state: "failed" });
    });

    it("without a known payment, waits only while the booking still awaits its deposit", () => {
        const unknown = { intentId: "pi_somebodyElse123", failed: false };
        expect(paymentReturnState(unknown, { status: "pending_payment", payments: [] })).toEqual({ state: "confirming" });
        expect(paymentReturnState(unknown, { status: "confirmed", payments: [] })).toEqual({ state: "succeeded", kind: null });
    });
});
