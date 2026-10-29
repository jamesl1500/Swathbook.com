// @vitest-environment node
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { createConnectedAccount, createOnboardingLink, summarizeAccount } from "./connect";
import { amountDue, createBookingPayment } from "./payments";
import { platformFeeCents } from "./server";
import { handleStripeEvent, paymentStatusFromIntent, refundStatusFromStripe } from "./webhooks";

/** Just the Stripe surface these modules use. */
function fakeStripe() {
    return {
        v2: {
            core: {
                accounts: { create: vi.fn(async () => ({ id: "acct_new" })), retrieve: vi.fn() },
                accountLinks: { create: vi.fn(async () => ({ url: "https://connect.stripe.com/setup/abc" })) },
            },
        },
        paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
        refunds: { retrieve: vi.fn(), list: vi.fn() },
        subscriptions: { retrieve: vi.fn() },
        checkout: { sessions: { retrieve: vi.fn() } },
    };
}

type FakeStripe = ReturnType<typeof fakeStripe>;
const asStripe = (stripe: FakeStripe) => stripe as unknown as Stripe;
const asAdmin = (mock: SupabaseMock) => mock.client as never;

let stripe: FakeStripe;
let db: SupabaseMock;

beforeEach(() => {
    stripe = fakeStripe();
    db = createSupabaseMock();
    vi.stubEnv("STRIPE_PLATFORM_FEE_BPS", "0");
});

describe("platformFeeCents", () => {
    it("is off by default", () => expect(platformFeeCents(10_000)).toBe(0));
    it("charges basis points when configured", () => expect(platformFeeCents(10_000, 100)).toBe(100));
    it("never exceeds the amount and ignores nonsense", () => {
        expect(platformFeeCents(500, 50_000)).toBe(500);
        expect(platformFeeCents(500, Number.NaN)).toBe(0);
        expect(platformFeeCents(500, -10)).toBe(0);
    });
});

describe("connected accounts", () => {
    it("creates an Express account with Stripe-managed fees and risk, idempotent per business", async () => {
        await createConnectedAccount(asStripe(stripe), { businessId: "b1", businessName: "Green Acres", email: "o@example.com" });
        const [params, options] = stripe.v2.core.accounts.create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
        expect(params).toMatchObject({
            contact_email: "o@example.com",
            display_name: "Green Acres",
            dashboard: "express",
            configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
            defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
            metadata: { business_id: "b1" },
        });
        expect(options).toEqual({ idempotencyKey: "connect-account:b1" });
    });

    it("builds hosted onboarding links that come back to the payouts page", async () => {
        const url = await createOnboardingLink(asStripe(stripe), "acct_1", "https://app.example.com");
        expect(url).toBe("https://connect.stripe.com/setup/abc");
        expect(stripe.v2.core.accountLinks.create).toHaveBeenCalledWith({
            account: "acct_1",
            use_case: {
                type: "account_onboarding",
                account_onboarding: {
                    collection_options: { fields: "eventually_due" },
                    refresh_url: "https://app.example.com/dashboard/payouts/refresh",
                    return_url: "https://app.example.com/dashboard/payouts/return",
                },
            },
        });
    });

    it("summarizes a fully onboarded account", () => {
        const status = summarizeAccount({
            id: "acct_1",
            configuration: { merchant: { capabilities: { card_payments: { status: "active" }, stripe_balance: { payouts: { status: "active" } } } } },
            requirements: { entries: [{ description: "Future thing", minimum_deadline: { status: "eventually_due" } }] },
        } as unknown as Stripe.V2.Core.Account);
        expect(status).toEqual({
            stripeAccountId: "acct_1",
            chargesEnabled: true,
            payoutsEnabled: true,
            detailsSubmitted: true,
            requirementsDue: [],
            disabledReason: null,
        });
    });

    it("lists what Stripe still needs and why payments are off", () => {
        const status = summarizeAccount({
            id: "acct_1",
            configuration: {
                merchant: {
                    capabilities: {
                        card_payments: { status: "restricted", status_details: [{ code: "requirements_past_due" }] },
                        stripe_balance: { payouts: { status: "pending" } },
                    },
                },
            },
            requirements: {
                entries: [
                    { description: "Bank account", minimum_deadline: { status: "currently_due" } },
                    { description: "ID document", minimum_deadline: { status: "past_due" } },
                    { description: "Bank account", minimum_deadline: { status: "currently_due" } },
                ],
            },
        } as unknown as Stripe.V2.Core.Account);
        expect(status).toMatchObject({
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            requirementsDue: ["Bank account", "ID document"],
            disabledReason: "requirements_past_due",
        });
    });
});

describe("amountDue", () => {
    const booking = { deposit_due_cents: 6000, deposit_paid_cents: 2000, balance_due_cents: 18000 };
    it("owes the unpaid part of the deposit", () => expect(amountDue(booking, "deposit")).toBe(4000));
    it("owes the booking balance", () => expect(amountDue(booking, "balance")).toBe(18000));
    it("never goes negative", () => expect(amountDue({ ...booking, balance_due_cents: -500 }, "balance")).toBe(0));
});

describe("createBookingPayment", () => {
    const booking = {
        id: "bk1",
        business_id: "b1",
        customer_id: "c1",
        status: "pending_payment",
        currency: "usd",
        deposit_due_cents: 6000,
        deposit_paid_cents: 0,
        balance_due_cents: 24000,
        hold_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        customers: { email: "dana@example.com" },
        businesses: { name: "Green Acres" },
    };

    beforeEach(() => {
        db.respond("bookings.select", { data: booking });
        db.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1", charges_enabled: true } });
        stripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret" });
    });

    it("creates a direct charge on the business's account and records it", async () => {
        const session = await createBookingPayment(asStripe(stripe), asAdmin(db), { bookingId: "bk1", kind: "deposit" });
        expect(session).toEqual({ clientSecret: "pi_1_secret", stripeAccountId: "acct_1", amountCents: 6000, kind: "deposit" });

        const [params, options] = stripe.paymentIntents.create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
        expect(params).toMatchObject({
            amount: 6000,
            currency: "usd",
            automatic_payment_methods: { enabled: true },
            receipt_email: "dana@example.com",
            metadata: { booking_id: "bk1", business_id: "b1", kind: "deposit" },
        });
        expect(params).not.toHaveProperty("application_fee_amount");
        expect(options).toMatchObject({ stripeAccount: "acct_1" });

        expect(db.callsTo("payments", "insert")[0].values).toMatchObject({
            booking_id: "bk1",
            kind: "deposit",
            status: "requires_payment",
            amount_cents: 6000,
            stripe_account_id: "acct_1",
            stripe_payment_intent_id: "pi_1",
        });
    });

    it("adds Swathbook's fee when one is configured", async () => {
        vi.stubEnv("STRIPE_PLATFORM_FEE_BPS", "100");
        await createBookingPayment(asStripe(stripe), asAdmin(db), { bookingId: "bk1", kind: "deposit" });
        expect(stripe.paymentIntents.create.mock.calls[0][0]).toMatchObject({ application_fee_amount: 60 });
    });

    it("reuses an open PaymentIntent instead of creating duplicates", async () => {
        db.respond("payments.select", { data: { stripe_payment_intent_id: "pi_open" } });
        stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_open", client_secret: "pi_open_secret", status: "requires_payment_method" });
        const session = await createBookingPayment(asStripe(stripe), asAdmin(db), { bookingId: "bk1", kind: "deposit" });
        expect(session).toMatchObject({ clientSecret: "pi_open_secret" });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it.each([
        ["the booking is cancelled", { ...booking, status: "cancelled" }, /cancelled/],
        ["the hold has expired", { ...booking, hold_expires_at: new Date(Date.now() - 1000).toISOString() }, /released/],
        ["nothing is owed", { ...booking, deposit_paid_cents: 6000 }, /Nothing to pay/],
    ])("refuses when %s", async (_label, row, message) => {
        db = createSupabaseMock();
        db.respond("bookings.select", { data: row });
        db.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1", charges_enabled: true } });
        const result = await createBookingPayment(asStripe(stripe), asAdmin(db), { bookingId: "bk1", kind: "deposit" });
        expect(result).toEqual({ error: expect.stringMatching(message) });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("refuses when the business can't take payments yet", async () => {
        db = createSupabaseMock();
        db.respond("bookings.select", { data: booking });
        db.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1", charges_enabled: false } });
        expect(await createBookingPayment(asStripe(stripe), asAdmin(db), { bookingId: "bk1", kind: "deposit" })).toEqual({
            error: expect.stringMatching(/isn't taking online payments/),
        });
    });
});

describe("webhook status mapping", () => {
    it.each([
        ["succeeded", false, "succeeded"],
        ["processing", false, "processing"],
        ["canceled", false, "canceled"],
        ["requires_payment_method", true, "failed"],
        ["requires_payment_method", false, "requires_payment"],
    ] as const)("PaymentIntent %s (failure=%s) -> %s", (status, failed, expected) => {
        expect(paymentStatusFromIntent(status, failed)).toBe(expected);
    });

    it.each([
        ["succeeded", "succeeded"],
        ["failed", "failed"],
        ["canceled", "canceled"],
        ["pending", "pending"],
        [null, "pending"],
    ])("refund %s -> %s", (status, expected) => {
        expect(refundStatusFromStripe(status)).toBe(expected);
    });
});

describe("handleStripeEvent", () => {
    const succeeded = {
        id: "evt_1",
        type: "v1.payment_intent.succeeded",
        context: "acct_1",
        related_object: { id: "pi_1", type: "payment_intent" },
    };

    beforeEach(() => {
        db.respond("stripe_webhook_events.upsert", { data: [{ id: "evt_1" }] });
        db.respond("stripe_webhook_events.select", { data: { attempts: 0, processed_at: null } });
        stripe.paymentIntents.retrieve.mockResolvedValue({
            id: "pi_1",
            status: "succeeded",
            amount: 6000,
            currency: "usd",
            metadata: { booking_id: "bk1", kind: "deposit" },
            last_payment_error: null,
            latest_charge: { id: "ch_1", payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } } },
        });
    });

    it("syncs Swathbook plans from platform subscription events", async () => {
        const subscription = {
            id: "sub_9",
            customer: "cus_9",
            status: "active",
            metadata: { business_id: "b9", plan: "crew" },
            cancel_at_period_end: false,
            trial_end: null,
            canceled_at: null,
            ended_at: null,
            items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_crew", lookup_key: "swathbook_crew_monthly" } }] },
        };
        stripe.subscriptions.retrieve.mockResolvedValue(subscription);
        const event = { id: "evt_1", type: "v1.customer.subscription.updated", related_object: { id: "sub_9", type: "subscription" } };

        expect(await handleStripeEvent(asStripe(stripe), asAdmin(db), event)).toBe("processed");
        expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_9");
        expect(db.callsTo("subscriptions", "upsert")[0].values).toMatchObject({ business_id: "b9", plan: "crew", status: "active" });
    });

    it("syncs the new plan as soon as checkout completes", async () => {
        stripe.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_1", mode: "subscription", subscription: "sub_9" });
        stripe.subscriptions.retrieve.mockResolvedValue({
            id: "sub_9",
            customer: "cus_9",
            status: "trialing",
            metadata: { business_id: "b9", plan: "solo" },
            items: { data: [{ price: { id: "price_solo", lookup_key: "swathbook_solo_monthly" } }] },
        });
        const event = { id: "evt_1", type: "v1.checkout.session.completed", related_object: { id: "cs_1", type: "checkout_session" } };
        expect(await handleStripeEvent(asStripe(stripe), asAdmin(db), event)).toBe("processed");
        expect(db.callsTo("subscriptions", "upsert")[0].values).toMatchObject({ plan: "solo", status: "trialing" });
    });

    it("re-fetches the PaymentIntent on the connected account and updates the payment", async () => {
        db.respond("payments.update", { data: [{ id: "pay_1" }] });
        expect(await handleStripeEvent(asStripe(stripe), asAdmin(db), succeeded)).toBe("processed");

        expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] }, { stripeAccount: "acct_1" });
        const [update] = db.callsTo("payments", "update");
        expect(update.values).toMatchObject({ status: "succeeded", stripe_charge_id: "ch_1", card_brand: "visa", card_last4: "4242" });
        expect(update.filters).toEqual([["eq", "stripe_payment_intent_id", "pi_1"]]);
        expect(db.callsTo("stripe_webhook_events", "update").at(-1)?.values).toMatchObject({ processed_at: expect.any(String), last_error: null });
    });

    it("records a payment it hadn't seen yet when the intent belongs to a booking", async () => {
        db.respond("payments.update", { data: [] });
        db.respond("bookings.select", { data: { business_id: "b1", customer_id: "c1", currency: "usd" } });
        await handleStripeEvent(asStripe(stripe), asAdmin(db), succeeded);
        expect(db.callsTo("payments", "insert")[0].values).toMatchObject({
            booking_id: "bk1",
            kind: "deposit",
            amount_cents: 6000,
            status: "succeeded",
            stripe_account_id: "acct_1",
        });
    });

    it("skips events it has already processed", async () => {
        db = createSupabaseMock();
        db.respond("stripe_webhook_events.upsert", { data: [] });
        db.respond("stripe_webhook_events.select", { data: { processed_at: "2026-10-24T00:00:00Z" } });
        expect(await handleStripeEvent(asStripe(stripe), asAdmin(db), succeeded)).toBe("duplicate");
        expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it("records refunds against the right payment", async () => {
        db.respond("payments.select", { data: { id: "pay_1", business_id: "b1" } });
        stripe.refunds.retrieve.mockResolvedValue({ id: "re_1", amount: 2000, status: "succeeded", reason: "requested_by_customer", payment_intent: "pi_1" });
        await handleStripeEvent(asStripe(stripe), asAdmin(db), { ...succeeded, type: "v1.refund.updated", related_object: { id: "re_1", type: "refund" } });
        expect(db.callsTo("refunds", "upsert")[0].values).toEqual({
            business_id: "b1",
            payment_id: "pay_1",
            amount_cents: 2000,
            status: "succeeded",
            reason: "requested_by_customer",
            stripe_refund_id: "re_1",
        });
    });

    it("refreshes the connected account on v2 account events", async () => {
        db.respond("stripe_connect_accounts.select", { data: { business_id: "b1" } });
        stripe.v2.core.accounts.retrieve.mockResolvedValue({
            id: "acct_1",
            configuration: { merchant: { capabilities: { card_payments: { status: "active" }, stripe_balance: { payouts: { status: "active" } } } } },
            requirements: { entries: [] },
        });
        const outcome = await handleStripeEvent(asStripe(stripe), asAdmin(db), {
            id: "evt_2",
            type: "v2.core.account[requirements].updated",
            related_object: { id: "acct_1", type: "v2.core.account" },
        });
        expect(outcome).toBe("processed");
        expect(db.callsTo("stripe_connect_accounts", "upsert")[0].values).toMatchObject({ business_id: "b1", charges_enabled: true, payouts_enabled: true });
    });

    it("ignores event types it doesn't handle", async () => {
        expect(await handleStripeEvent(asStripe(stripe), asAdmin(db), { id: "evt_3", type: "v1.customer.created" })).toBe("ignored");
    });

    it("records the error and rethrows so Stripe retries", async () => {
        stripe.paymentIntents.retrieve.mockRejectedValue(new Error("Stripe is down"));
        await expect(handleStripeEvent(asStripe(stripe), asAdmin(db), succeeded)).rejects.toThrow("Stripe is down");
        expect(db.callsTo("stripe_webhook_events", "update")[0].values).toEqual({ attempts: 1, last_error: "Stripe is down" });
    });
});
