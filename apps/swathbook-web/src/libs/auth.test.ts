// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieJar, expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    cookies: null as unknown as ReturnType<typeof import("@/test/next-mocks").createCookieJar>,
}));

vi.mock("./supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => state.cookies) }));

import { ACTIVE_BUSINESS_COOKIE } from "./active-business";
import {
    getActiveBusiness,
    getCurrentUser,
    getDraftBusiness,
    getPostAuthPath,
    listMyBusinesses,
    pickActiveBusiness,
    requireUser,
    type BusinessSummary,
} from "./auth";

function business(overrides: Partial<BusinessSummary>): BusinessSummary {
    return {
        id: "b1",
        name: "Green Acres",
        slug: "green-acres",
        trade: "lawn-care",
        onboarding_completed_at: "2026-10-01T00:00:00Z",
        created_at: "2026-10-01T00:00:00Z",
        role: "owner",
        ...overrides,
    };
}

function membershipRows(...items: BusinessSummary[]) {
    return items.map(({ role, ...rest }) => ({ role, business: rest }));
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.cookies = createCookieJar();
});

describe("getCurrentUser", () => {
    it("returns null when signed out", async () => {
        expect(await getCurrentUser()).toBeNull();
    });

    it("maps verified JWT claims", async () => {
        state.supabase.auth.getClaims.mockResolvedValue({
            data: {
                claims: {
                    sub: "u1",
                    email: "dana@example.com",
                    user_metadata: { full_name: "Dana Field", desired_slug: "green-acres" },
                },
            },
            error: null,
        });
        expect(await getCurrentUser()).toEqual({
            id: "u1",
            email: "dana@example.com",
            fullName: "Dana Field",
            desiredSlug: "green-acres",
        });
    });

    it("tolerates missing or odd metadata", async () => {
        state.supabase.auth.getClaims.mockResolvedValue({
            data: { claims: { sub: "u1", user_metadata: { full_name: 42 } } },
            error: null,
        });
        expect(await getCurrentUser()).toEqual({ id: "u1", email: "", fullName: "", desiredSlug: "" });
    });
});

describe("requireUser", () => {
    it("redirects signed-out visitors to login with a return path", async () => {
        await expectRedirect(requireUser("/onboarding?new=1"), "/auth/login?next=%2Fonboarding%3Fnew%3D1");
    });
});

describe("listMyBusinesses", () => {
    it("returns the user's active memberships, oldest first", async () => {
        state.supabase.respond("business_members.select", {
            data: membershipRows(
                business({ id: "b2", name: "Newer", created_at: "2026-10-05T00:00:00Z", role: "admin" }),
                business({ id: "b1", name: "Older", created_at: "2026-10-01T00:00:00Z" }),
            ),
        });
        const businesses = await listMyBusinesses("u1");
        expect(businesses.map((item) => [item.id, item.role])).toEqual([
            ["b1", "owner"],
            ["b2", "admin"],
        ]);
        expect(state.supabase.callsTo("business_members")[0].filters).toEqual([
            ["eq", "user_id", "u1"],
            ["eq", "status", "active"],
        ]);
    });
});

describe("pickActiveBusiness", () => {
    const first = business({ id: "b1" });
    const second = business({ id: "b2" });
    const draft = business({ id: "b3", onboarding_completed_at: null });

    it("uses the remembered business", () => {
        expect(pickActiveBusiness([first, second], "b2")).toBe(second);
    });

    it("falls back to the first live business when the remembered one is gone", () => {
        expect(pickActiveBusiness([first, second], "deleted")).toBe(first);
    });

    it("never picks a business that hasn't finished onboarding", () => {
        expect(pickActiveBusiness([draft, second], "b3")).toBe(second);
    });

    it("returns null when nothing is live", () => {
        expect(pickActiveBusiness([draft], null)).toBeNull();
    });
});

describe("getActiveBusiness", () => {
    it("reads the preference from the cookie", async () => {
        state.cookies = createCookieJar({ [ACTIVE_BUSINESS_COOKIE]: "b2" });
        state.supabase.respond("business_members.select", {
            data: membershipRows(business({ id: "b1" }), business({ id: "b2", created_at: "2026-10-02T00:00:00Z" })),
        });
        const { active, businesses } = await getActiveBusiness("u1");
        expect(active?.id).toBe("b2");
        expect(businesses).toHaveLength(2);
    });
});

describe("getDraftBusiness", () => {
    it("looks for the newest unfinished business the user owns", async () => {
        state.supabase.respond("businesses.select", { data: { id: "b9", name: "Draft", slug: "draft", trade: "x" } });
        expect(await getDraftBusiness("u1")).toEqual({ id: "b9", name: "Draft", slug: "draft", trade: "x" });
        expect(state.supabase.callsTo("businesses")[0].filters).toEqual([
            ["eq", "owner_id", "u1"],
            ["is", "onboarding_completed_at", null],
            ["order", "created_at", { ascending: false }],
            ["limit", 1],
        ]);
    });
});

describe("getPostAuthPath", () => {
    it("goes to the dashboard once any business is live", async () => {
        state.supabase.respond("business_members.select", {
            data: membershipRows(business({ id: "b1", onboarding_completed_at: null }), business({ id: "b2" })),
        });
        expect(await getPostAuthPath("u1")).toBe("/dashboard");
    });

    it("goes to onboarding until then", async () => {
        state.supabase.respond("business_members.select", {
            data: membershipRows(business({ onboarding_completed_at: null })),
        });
        expect(await getPostAuthPath("u1")).toBe("/onboarding");
    });

    it("goes to onboarding for brand-new users", async () => {
        expect(await getPostAuthPath("u1")).toBe("/onboarding");
    });
});
