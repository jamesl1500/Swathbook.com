// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID, form } from "@/test/dashboard";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    auth: {} as Record<string, unknown>,
    stripeConfigured: true,
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
}));

vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/site-url", () => ({ getSiteUrl: vi.fn(async () => "https://swathbook.test") }));
vi.mock("@/libs/billing/stripe-billing", () => ({ createCheckoutSession: state.createCheckoutSession, createPortalSession: state.createPortalSession }));
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => state.stripeConfigured, getStripe: () => ({}) }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import { PLANS } from "@/libs/billing/plans";
import { openBillingPortal, startCheckout } from "./actions";

const PLAN = Object.keys(PLANS)[0];

const owner = { user: { id: "u1", email: "olive@example.com" }, role: "owner", businessId: BUSINESS_ID };
const business = { id: BUSINESS_ID, name: "Green Acres", stripe_customer_id: "cus_1", trial_ends_at: null };

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.auth = owner;
    state.stripeConfigured = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.createCheckoutSession.mockReset().mockResolvedValue("https://checkout.stripe.test/s1");
    state.createPortalSession.mockReset().mockResolvedValue("https://billing.stripe.test/p1");
});

describe("startCheckout", () => {
    it("sends the owner to Stripe Checkout for the plan, returning to billing", async () => {
        state.admin.respond("businesses.select", { data: business });
        await expectRedirect(startCheckout({}, form({ plan: PLAN })), "https://checkout.stripe.test/s1");
        expect(state.createCheckoutSession).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
            business,
            plan: PLAN,
            email: "olive@example.com",
            returnUrl: "https://swathbook.test/dashboard/billing",
        });
    });

    it("rejects unknown plans, non-owners and missing config before calling Stripe", async () => {
        expect((await startCheckout({}, form({ plan: "enterprise-free-forever" }))).error).toBe("Pick a plan.");

        state.auth = { ...owner, role: "admin" };
        expect((await startCheckout({}, form({ plan: PLAN }))).error).toBe("Only the business owner can change billing.");

        state.auth = owner;
        state.stripeConfigured = false;
        expect((await startCheckout({}, form({ plan: PLAN }))).error).toMatch(/isn't configured/);
        expect(state.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("explains a failed or empty checkout session", async () => {
        state.admin.respond("businesses.select", { data: business });
        state.createCheckoutSession.mockRejectedValueOnce(new Error("stripe down")).mockResolvedValueOnce(null);
        expect((await startCheckout({}, form({ plan: PLAN }))).error).toMatch(/couldn't start checkout/);
        expect((await startCheckout({}, form({ plan: PLAN }))).error).toMatch(/couldn't start checkout/);
    });
});

describe("openBillingPortal", () => {
    it("opens the portal for the business's Stripe customer", async () => {
        state.admin.respond("businesses.select", { data: { stripe_customer_id: "cus_1" } });
        await expectRedirect(openBillingPortal({}, form()), "https://billing.stripe.test/p1");
        expect(state.createPortalSession).toHaveBeenCalledWith(expect.anything(), "cus_1", "https://swathbook.test/dashboard/billing");
    });

    it("asks to choose a plan first", async () => {
        state.admin.respond("businesses.select", { data: { stripe_customer_id: null } });
        expect((await openBillingPortal({}, form())).error).toBe("Choose a plan first.");
    });
});
