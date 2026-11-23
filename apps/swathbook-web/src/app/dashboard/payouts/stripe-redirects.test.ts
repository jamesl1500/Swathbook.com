// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const FIRST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    user: { id: "u1" } as { id: string } | null,
    businesses: [] as Array<{ id: string; role: string; onboarding_completed_at: string | null }>,
    connect: {
        createOnboardingLink: vi.fn(),
        retrieveAccountStatus: vi.fn(),
        saveConnectStatus: vi.fn(),
    },
}));

vi.mock("@/libs/auth", () => ({
    getCurrentUser: vi.fn(async () => state.user),
    listMyBusinesses: vi.fn(async () => state.businesses),
}));
vi.mock("@/libs/site-url", () => ({ getSiteUrl: vi.fn(async () => "https://swathbook.test") }));
vi.mock("@/libs/stripe/connect", () => state.connect);
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => true, getStripe: () => ({}) }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));

import { handleOnboardingRefresh, handleOnboardingReturn } from "./stripe-redirects";

const request = (path: string, business?: string) =>
    new NextRequest(`https://swathbook.test/dashboard/payouts/${path}${business ? `?business=${business}` : ""}`, {
        // The dashboard is open on the other business.
        headers: { cookie: `swathbook_business=${FIRST}` },
    });

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.user = { id: "u1" };
    state.businesses = [
        { id: FIRST, role: "owner", onboarding_completed_at: "2026-11-01T00:00:00Z" },
        { id: SECOND, role: "owner", onboarding_completed_at: "2026-11-02T00:00:00Z" },
    ];
    state.admin.respond("stripe_connect_accounts.select", { data: { stripe_account_id: "acct_second" } });
    state.connect.createOnboardingLink.mockReset().mockResolvedValue("https://connect.stripe.test/onboarding");
    state.connect.retrieveAccountStatus.mockReset().mockResolvedValue({ stripeAccountId: "acct_second" });
    state.connect.saveConnectStatus.mockReset().mockResolvedValue(undefined);
});

describe("Stripe onboarding redirects", () => {
    it("returns to the business in the link, even if another one is active", async () => {
        const response = await handleOnboardingReturn(request("return", SECOND));

        expect(state.connect.retrieveAccountStatus).toHaveBeenCalledWith(expect.anything(), "acct_second");
        expect(state.connect.saveConnectStatus).toHaveBeenCalledWith(expect.anything(), SECOND, { stripeAccountId: "acct_second" });
        expect(response.headers.get("location")).toBe("https://swathbook.test/dashboard/payouts?onboarding=returned");
        expect(response.cookies.get("swathbook_business")?.value).toBe(SECOND);
    });

    it("mints a fresh link for the business in the link", async () => {
        const response = await handleOnboardingRefresh(request("refresh", SECOND));

        expect(state.connect.createOnboardingLink).toHaveBeenCalledWith(expect.anything(), "acct_second", SECOND, "https://swathbook.test");
        expect(response.headers.get("location")).toBe("https://connect.stripe.test/onboarding");
    });

    it.each([
        ["no business in the link", undefined],
        ["a business the user isn't part of", "33333333-3333-4333-8333-333333333333"],
    ])("touches no Stripe account for %s", async (_name, business) => {
        const response = await handleOnboardingRefresh(request("refresh", business));

        expect(state.connect.createOnboardingLink).not.toHaveBeenCalled();
        expect(response.headers.get("location")).toBe("https://swathbook.test/dashboard/payouts");
    });

    it("doesn't let an admin continue the owner's Stripe setup", async () => {
        state.businesses[1].role = "admin";
        await handleOnboardingReturn(request("return", SECOND));
        expect(state.connect.saveConnectStatus).not.toHaveBeenCalled();
    });
});
