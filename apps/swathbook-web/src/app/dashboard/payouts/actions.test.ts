// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID } from "@/test/dashboard";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    auth: {} as Record<string, unknown>,
    stripeConfigured: true,
    createLoginLink: vi.fn(),
    connect: {
        createConnectedAccount: vi.fn(),
        createOnboardingLink: vi.fn(),
        retrieveAccountStatus: vi.fn(),
        saveConnectStatus: vi.fn(),
    },
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/site-url", () => ({ getSiteUrl: vi.fn(async () => "https://swathbook.test") }));
vi.mock("@/libs/stripe/connect", () => state.connect);
vi.mock("@/libs/stripe/server", () => ({
    hasStripe: () => state.stripeConfigured,
    getStripe: () => ({ accounts: { createLoginLink: state.createLoginLink } }),
}));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import { openExpressDashboard, refreshPayoutStatus, startPayoutsOnboarding } from "./actions";

function form() {
    const data = new FormData();
    data.set("businessId", BUSINESS_ID);
    return data;
}

const owner = { user: { id: "u1", email: "olive@example.com" }, role: "owner", businessId: BUSINESS_ID, business: { name: "Green Acres" } };

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.auth = owner;
    state.stripeConfigured = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.createLoginLink.mockReset().mockResolvedValue({ url: "https://connect.stripe.test/express/login" });
    state.connect.createConnectedAccount.mockReset().mockResolvedValue({ id: "acct_new" });
    state.connect.createOnboardingLink.mockReset().mockResolvedValue("https://connect.stripe.test/onboarding");
    state.connect.retrieveAccountStatus.mockReset().mockResolvedValue({ stripeAccountId: "acct_1", chargesEnabled: true });
    state.connect.saveConnectStatus.mockReset().mockResolvedValue(undefined);
});

describe("startPayoutsOnboarding", () => {
    it("creates the Stripe account on first use, records it, then sends the owner to Stripe", async () => {
        await expectRedirect(startPayoutsOnboarding(form()), "https://connect.stripe.test/onboarding");

        expect(state.connect.createConnectedAccount).toHaveBeenCalledWith(expect.anything(), { businessId: BUSINESS_ID, businessName: "Green Acres", email: "olive@example.com" });
        expect(state.connect.saveConnectStatus).toHaveBeenCalledWith(expect.anything(), BUSINESS_ID, expect.objectContaining({ stripeAccountId: "acct_new", chargesEnabled: false }));
        expect(state.connect.createOnboardingLink).toHaveBeenCalledWith(expect.anything(), "acct_new", "https://swathbook.test");
    });

    it("reuses an existing account instead of creating a second one", async () => {
        state.admin.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1" } });
        await expectRedirect(startPayoutsOnboarding(form()), "https://connect.stripe.test/onboarding");
        expect(state.connect.createConnectedAccount).not.toHaveBeenCalled();
        expect(state.connect.createOnboardingLink).toHaveBeenCalledWith(expect.anything(), "acct_1", "https://swathbook.test");
    });

    it("explains when Stripe is unreachable", async () => {
        state.connect.createOnboardingLink.mockRejectedValue(new Error("network"));
        expect((await startPayoutsOnboarding(form())).error).toMatch(/couldn't reach Stripe/);
    });

    it("is for the owner only, and only when Stripe is configured", async () => {
        state.auth = { ...owner, role: "admin" };
        expect((await startPayoutsOnboarding(form())).error).toBe("Only the business owner can manage payouts.");

        state.auth = owner;
        state.stripeConfigured = false;
        expect((await startPayoutsOnboarding(form())).error).toMatch(/aren't configured/);
        expect(state.connect.createConnectedAccount).not.toHaveBeenCalled();
    });
});

describe("openExpressDashboard", () => {
    it("opens the Stripe Express dashboard", async () => {
        state.admin.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1" } });
        await expectRedirect(openExpressDashboard(form()), "https://connect.stripe.test/express/login");
        expect(state.createLoginLink).toHaveBeenCalledWith("acct_1");
    });

    it("asks to set up first, and explains a login-link failure", async () => {
        expect((await openExpressDashboard(form())).error).toBe("Set up payouts first.");

        state.admin.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1" } });
        state.createLoginLink.mockRejectedValue(new Error("account not onboarded"));
        expect((await openExpressDashboard(form())).error).toMatch(/Finish setup first/);
    });
});

describe("refreshPayoutStatus", () => {
    it("saves the latest status from Stripe", async () => {
        state.admin.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_1" } });
        expect(await refreshPayoutStatus(form())).toEqual({ success: "Payout status updated." });
        expect(state.connect.saveConnectStatus).toHaveBeenCalledWith(expect.anything(), BUSINESS_ID, { stripeAccountId: "acct_1", chargesEnabled: true });
    });

    it("admins can refresh too, but not before setup", async () => {
        state.auth = { ...owner, role: "admin" };
        expect((await refreshPayoutStatus(form())).error).toBe("Set up payouts first.");
    });
});
