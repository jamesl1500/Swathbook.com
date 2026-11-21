// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID, form } from "@/test/dashboard";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    auth: {} as Record<string, unknown>,
    stripeConfigured: true,
    createPortalSession: vi.fn(),
}));

vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/site-url", () => ({ getSiteUrl: vi.fn(async () => "https://swathbook.test") }));
vi.mock("@/libs/billing/stripe-billing", async (importOriginal) => ({
    isMissingResource: (await importOriginal<typeof import("@/libs/billing/stripe-billing")>()).isMissingResource,
    createPortalSession: state.createPortalSession,
}));
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => state.stripeConfigured, getStripe: () => ({}) }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import { openBillingPortal } from "./actions";

const owner = { user: { id: "u1", email: "olive@example.com" }, role: "owner", businessId: BUSINESS_ID };

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.auth = owner;
    state.stripeConfigured = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.createPortalSession.mockReset().mockResolvedValue("https://billing.stripe.test/p1");
});

describe("openBillingPortal", () => {
    it("opens the portal for the business's Stripe customer", async () => {
        state.admin.respond("businesses.select", { data: { stripe_customer_id: "cus_1" } });
        await expectRedirect(openBillingPortal({}, form()), "https://billing.stripe.test/p1");
        expect(state.createPortalSession).toHaveBeenCalledWith(expect.anything(), "cus_1", "https://swathbook.test/dashboard/billing");
    });

    it("says there's nothing to manage without a Stripe customer", async () => {
        state.admin.respond("businesses.select", { data: { stripe_customer_id: null } });
        expect((await openBillingPortal({}, form())).error).toMatch(/no plan to manage/);
    });

    it("is for the owner only, and needs Stripe configured", async () => {
        state.auth = { ...owner, role: "admin" };
        expect((await openBillingPortal({}, form())).error).toBe("Only the business owner can change billing.");
        state.auth = owner;
        state.stripeConfigured = false;
        expect((await openBillingPortal({}, form())).error).toMatch(/isn't configured/);
        expect(state.createPortalSession).not.toHaveBeenCalled();
    });

    it("forgets a customer Stripe doesn't have (e.g. made with another account's keys)", async () => {
        state.admin.respond("businesses.select", { data: { stripe_customer_id: "cus_gone" } });
        state.createPortalSession.mockRejectedValueOnce(Object.assign(new Error("No such customer: 'cus_gone'"), { code: "resource_missing" }));
        expect((await openBillingPortal({}, form())).error).toMatch(/no plan to manage/);
        expect(state.admin.callsTo("businesses", "update")[0]).toMatchObject({ values: { stripe_customer_id: null }, filters: [["eq", "id", BUSINESS_ID]] });
    });

    it("doesn't forget the customer over other errors", async () => {
        state.admin.respond("businesses.select", { data: { stripe_customer_id: "cus_1" } });
        state.createPortalSession.mockRejectedValueOnce(new Error("network"));
        expect((await openBillingPortal({}, form())).error).toBe("We couldn't open billing. Please try again.");
        expect(state.admin.callsTo("businesses", "update")).toHaveLength(0);
    });
});
