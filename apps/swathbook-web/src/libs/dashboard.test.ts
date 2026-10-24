// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessSummary } from "./auth";

const state = vi.hoisted(() => ({
    user: { id: "u1", email: "o@example.com", fullName: "Owner", desiredSlug: "" } as { id: string } | null,
    businesses: [] as BusinessSummary[],
}));

vi.mock("./auth", () => ({
    getCurrentUser: vi.fn(async () => state.user),
    listMyBusinesses: vi.fn(async () => state.businesses),
    getActiveBusiness: vi.fn(),
    requireUser: vi.fn(),
}));
vi.mock("./supabase/server", () => ({ createClient: vi.fn() }));

import { authorizeBusiness, isFailure } from "./dashboard";

const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";

beforeEach(() => {
    state.user = { id: "u1" };
    state.businesses = [
        { id: BUSINESS_ID, name: "Green Acres", slug: "green-acres", trade: "lawn-care", onboarding_completed_at: "x", created_at: "x", role: "owner" },
    ];
});

describe("authorizeBusiness", () => {
    it("allows members of the business", async () => {
        const result = await authorizeBusiness(BUSINESS_ID);
        expect(isFailure(result)).toBe(false);
        expect(result).toMatchObject({ businessId: BUSINESS_ID, role: "owner" });
    });

    it("rejects ids that aren't UUIDs", async () => {
        expect(await authorizeBusiness("not-a-uuid")).toEqual({ error: expect.stringMatching(/Refresh/) });
        expect(await authorizeBusiness(null)).toEqual({ error: expect.any(String) });
    });

    it("requires a session", async () => {
        state.user = null;
        expect(await authorizeBusiness(BUSINESS_ID)).toEqual({ error: expect.stringMatching(/session expired/) });
    });

    it("rejects businesses the user doesn't belong to", async () => {
        expect(await authorizeBusiness("0e9f8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f")).toEqual({ error: expect.stringMatching(/don't have access/) });
    });

    it("keeps crew out of owner/admin actions but lets them do crew work", async () => {
        state.businesses = [{ ...state.businesses[0], role: "crew" }];
        expect(await authorizeBusiness(BUSINESS_ID, { manage: true })).toEqual({ error: expect.stringMatching(/Only owners and admins/) });
        expect(isFailure(await authorizeBusiness(BUSINESS_ID))).toBe(false);
    });
});
