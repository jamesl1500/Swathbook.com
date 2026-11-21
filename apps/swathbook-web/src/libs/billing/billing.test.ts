// @vitest-environment node
import type Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { cardProcessingCents, estimateTakeHome, serviceDepositCents, swathbookFeeCents } from "./fees";
import { summarizeFees } from "./load";
import { planForLookupKey } from "./plans";
import { syncSubscription } from "./stripe-billing";

describe("Swathbook's fee", () => {
    it("is 1.25% of a payment, rounded to the cent", () => {
        expect(swathbookFeeCents(10_000)).toBe(125);
        expect(swathbookFeeCents(6_000)).toBe(75);
        expect(swathbookFeeCents(4_999)).toBe(62);
        expect(swathbookFeeCents(50)).toBe(1);
    });

    it("is nothing on nothing, and ignores nonsense", () => {
        expect(swathbookFeeCents(0)).toBe(0);
        expect(swathbookFeeCents(-500)).toBe(0);
        expect(swathbookFeeCents(Number.NaN)).toBe(0);
    });
});

describe("take-home estimate", () => {
    it("takes the fee and card processing off a price paid in one go", () => {
        expect(cardProcessingCents(20_000)).toBe(610);
        expect(estimateTakeHome(20_000)).toEqual({ priceCents: 20_000, swathbookFeeCents: 250, processingCents: 610, takeHomeCents: 19_140, charges: 1 });
    });

    it("counts two charges when a deposit comes first", () => {
        // $50 deposit then $150 balance: each charge is rounded on its own, and 30¢ is paid twice.
        expect(estimateTakeHome(20_000, 5_000)).toEqual({ priceCents: 20_000, swathbookFeeCents: 251, processingCents: 640, takeHomeCents: 19_109, charges: 2 });
    });

    it("treats a full-price deposit as one charge, and never goes below zero", () => {
        expect(estimateTakeHome(8_900, 8_900).charges).toBe(1);
        expect(estimateTakeHome(0)).toMatchObject({ takeHomeCents: 0, charges: 0 });
        expect(estimateTakeHome(20).takeHomeCents).toBe(0);
    });

    it("works out deposits like the database does", () => {
        expect(serviceDepositCents({ price_cents: 18_000, deposit_type: "percent", deposit_percent: 25, deposit_amount_cents: null })).toBe(4_500);
        expect(serviceDepositCents({ price_cents: 5_000, deposit_type: "fixed", deposit_percent: null, deposit_amount_cents: 9_000 })).toBe(5_000);
        expect(serviceDepositCents({ price_cents: 5_000, deposit_type: "none", deposit_percent: 50, deposit_amount_cents: 100 })).toBe(0);
    });
});

describe("fee summary", () => {
    it("adds up what was kept after refunds, returning the fee pro rata", () => {
        expect(
            summarizeFees([
                { amount_cents: 10_000, amount_refunded_cents: 0, application_fee_cents: 125 },
                { amount_cents: 8_000, amount_refunded_cents: 4_000, application_fee_cents: 100 },
                { amount_cents: 2_000, amount_refunded_cents: 2_000, application_fee_cents: 25 },
                { amount_cents: 1_500, amount_refunded_cents: 0, application_fee_cents: 0 },
            ]),
        ).toEqual({ payments: 4, collectedCents: 15_500, feeCents: 175 });
    });
});

describe("plans from before per-payment pricing", () => {
    let admin: SupabaseMock;

    beforeEach(() => {
        admin = createSupabaseMock();
    });

    it("maps Stripe lookup keys back to plans", () => {
        expect(planForLookupKey("swathbook_crew_monthly")).toBe("crew");
        expect(planForLookupKey("something_else")).toBeNull();
    });

    it("mirrors a subscription, finding the business by customer when metadata is missing", async () => {
        admin.respond("businesses.select", { data: { id: "b1" } });
        const subscription = {
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            metadata: {},
            cancel_at_period_end: true,
            trial_end: null,
            canceled_at: null,
            ended_at: null,
            items: { data: [{ current_period_start: 1_800_000_000, current_period_end: 1_802_592_000, price: { id: "price_solo", lookup_key: "swathbook_solo_monthly" } }] },
        } as unknown as Stripe.Subscription;

        expect(await syncSubscription(admin.client as never, subscription)).toEqual({ businessId: "b1", plan: "solo", status: "active" });
        expect(admin.callsTo("subscriptions", "upsert")[0].values).toMatchObject({
            business_id: "b1",
            stripe_subscription_id: "sub_1",
            stripe_customer_id: "cus_1",
            stripe_price_id: "price_solo",
            plan: "solo",
            status: "active",
            cancel_at_period_end: true,
            current_period_end: new Date(1_802_592_000 * 1000).toISOString(),
        });
    });

    it("refuses a subscription it can't place", async () => {
        const orphan = { id: "sub_2", customer: "cus_unknown", metadata: {}, items: { data: [] } } as unknown as Stripe.Subscription;
        await expect(syncSubscription(admin.client as never, orphan)).rejects.toThrow("No business for subscription sub_2");
    });
});
