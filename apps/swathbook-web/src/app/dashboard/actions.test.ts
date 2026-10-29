// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieJar, expectRedirect } from "@/test/next-mocks";
import type { BusinessSummary } from "@/libs/auth";

const state = vi.hoisted(() => ({
    cookies: null as unknown as ReturnType<typeof import("@/test/next-mocks").createCookieJar>,
    user: { id: "u1" } as { id: string } | null,
    businesses: [] as BusinessSummary[],
}));

vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => state.cookies) }));
vi.mock("@/libs/auth", () => ({
    getCurrentUser: vi.fn(async () => state.user),
    listMyBusinesses: vi.fn(async () => state.businesses),
}));

import { ACTIVE_BUSINESS_COOKIE } from "@/libs/active-business";
import { selectBusiness } from "./actions";

const live = (id: string): BusinessSummary => ({
    id,
    name: id,
    slug: id,
    trade: "lawn-care",
    onboarding_completed_at: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    role: "owner",
});

function choose(businessId: string) {
    const data = new FormData();
    data.set("businessId", businessId);
    return selectBusiness(data);
}

beforeEach(() => {
    state.cookies = createCookieJar();
    state.user = { id: "u1" };
    state.businesses = [live("b1"), live("b2"), { ...live("draft"), onboarding_completed_at: null }];
});

describe("selectBusiness", () => {
    it("switches to another business the user belongs to", async () => {
        await expectRedirect(choose("b2"), "/dashboard");
        expect(state.cookies.values.get(ACTIVE_BUSINESS_COOKIE)).toBe("b2");
    });

    it("ignores businesses the user isn't a member of", async () => {
        await expectRedirect(choose("someone-elses"), "/dashboard");
        expect(state.cookies.values.has(ACTIVE_BUSINESS_COOKIE)).toBe(false);
    });

    it("ignores businesses that haven't finished onboarding", async () => {
        await expectRedirect(choose("draft"), "/dashboard");
        expect(state.cookies.values.has(ACTIVE_BUSINESS_COOKIE)).toBe(false);
    });

    it("requires a session", async () => {
        state.user = null;
        await expectRedirect(choose("b1"), "/auth/login");
    });
});
