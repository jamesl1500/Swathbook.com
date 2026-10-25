// @vitest-environment node
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { planForLookupKey } from "./plans";
import { billingState } from "./status";
import { createCheckoutSession, priceIdFor, remainingTrialEnd, resetPriceCache, syncSubscription } from "./stripe-billing";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const days = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const sub = (status: string, extra: Record<string, unknown> = {}) =>
    ({ plan: "crew", status, current_period_end: days(30), cancel_at_period_end: false, trial_end: null, ...extra }) as never;

describe("billingState", () => {
    it("counts trial days, rounding up", () => {
        expect(billingState({ trialEndsAt: days(13.2), subscription: null }, NOW)).toMatchObject({ kind: "trial", daysLeft: 14, hasAccess: true });
        expect(billingState({ trialEndsAt: days(0.1), subscription: null }, NOW)).toMatchObject({ kind: "trial", daysLeft: 1 });
    });

    it("pauses when the trial is over and there's no plan", () => {
        expect(billingState({ trialEndsAt: days(-1), subscription: null }, NOW)).toEqual({ kind: "lapsed", hasAccess: false, reason: "trial_ended" });
    });

    it("a live plan wins over the trial", () => {
        expect(billingState({ trialEndsAt: days(5), subscription: sub("active") }, NOW)).toMatchObject({ kind: "active", plan: "crew", hasAccess: true });
        expect(billingState({ trialEndsAt: null, subscription: sub("trialing") }, NOW)).toMatchObject({ kind: "active" });
    });

    it("keeps the page open while a payment is retried", () => {
        expect(billingState({ trialEndsAt: null, subscription: sub("past_due") }, NOW)).toMatchObject({ kind: "past_due", hasAccess: true });
    });

    it("explains why access ended", () => {
        expect(billingState({ trialEndsAt: days(-3), subscription: sub("canceled") }, NOW)).toMatchObject({ kind: "lapsed", reason: "canceled" });
        expect(billingState({ trialEndsAt: days(-3), subscription: sub("unpaid") }, NOW)).toMatchObject({ kind: "lapsed", reason: "unpaid" });
    });

    it("a canceled plan still in its trial window keeps access", () => {
        expect(billingState({ trialEndsAt: days(2), subscription: sub("canceled") }, NOW)).toMatchObject({ kind: "trial", daysLeft: 2 });
    });
});

describe("plans", () => {
    it("maps Stripe lookup keys back to plans", () => {
        expect(planForLookupKey("swathbook_crew_monthly")).toBe("crew");
        expect(planForLookupKey("something_else")).toBeNull();
    });

    it("only carries trial days Stripe accepts (48 hours or more)", () => {
        expect(remainingTrialEnd(days(10), NOW)).toBe(Math.floor(Date.parse(days(10)) / 1000));
        expect(remainingTrialEnd(days(1), NOW)).toBeUndefined();
        expect(remainingTrialEnd(null, NOW)).toBeUndefined();
    });
});

function fakeStripe() {
    return {
        prices: { list: vi.fn(async () => ({ data: [] as Array<{ id: string }> })), create: vi.fn(async () => ({ id: "price_new" })) },
        customers: { create: vi.fn(async () => ({ id: "cus_new" })) },
        checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.com/c/pay_123" })) } },
    };
}

describe("Stripe Billing", () => {
    let stripe: ReturnType<typeof fakeStripe>;
    let admin: SupabaseMock;

    beforeEach(() => {
        stripe = fakeStripe();
        admin = createSupabaseMock();
        resetPriceCache();
    });

    it("reuses a price by lookup key, or creates it once", async () => {
        stripe.prices.list.mockResolvedValueOnce({ data: [{ id: "price_existing" }] });
        expect(await priceIdFor(stripe as unknown as Stripe, "solo")).toBe("price_existing");
        expect(stripe.prices.create).not.toHaveBeenCalled();

        expect(await priceIdFor(stripe as unknown as Stripe, "crew")).toBe("price_new");
        expect(stripe.prices.create).toHaveBeenCalledWith(
            expect.objectContaining({ unit_amount: 7900, lookup_key: "swathbook_crew_monthly", recurring: { interval: "month" } }),
            { idempotencyKey: "price:swathbook_crew_monthly:7900" },
        );
        await priceIdFor(stripe as unknown as Stripe, "crew");
        expect(stripe.prices.list).toHaveBeenCalledTimes(2); // cached after the first lookup
    });

    it("starts checkout for a new customer and keeps the rest of the trial", async () => {
        const trialEnd = new Date(Date.now() + 10 * 86_400_000).toISOString();
        const url = await createCheckoutSession(stripe as unknown as Stripe, admin.client as never, {
            business: { id: "b1", name: "Shine On", stripe_customer_id: null, trial_ends_at: trialEnd },
            plan: "crew",
            email: "olive@example.com",
            returnUrl: "https://swathbook.test/dashboard/billing",
        });
        expect(url).toBe("https://checkout.stripe.com/c/pay_123");
        expect(stripe.customers.create).toHaveBeenCalledWith(
            { name: "Shine On", email: "olive@example.com", metadata: { business_id: "b1" } },
            { idempotencyKey: "billing-customer:b1" },
        );
        expect(admin.callsTo("businesses", "update")[0].values).toEqual({ stripe_customer_id: "cus_new" });
        expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "subscription",
                customer: "cus_new",
                client_reference_id: "b1",
                subscription_data: { metadata: { business_id: "b1", plan: "crew" }, trial_end: Math.floor(Date.parse(trialEnd) / 1000) },
                success_url: "https://swathbook.test/dashboard/billing?checkout=success",
            }),
        );
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
