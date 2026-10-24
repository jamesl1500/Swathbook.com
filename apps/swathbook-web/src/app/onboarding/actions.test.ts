// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieJar, expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import type { OnboardingInput } from "./schema";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    cookies: null as unknown as ReturnType<typeof import("@/test/next-mocks").createCookieJar>,
    user: null as { id: string } | null,
    draft: null as { id: string; name: string; slug: string; trade: string } | null,
}));

vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => state.cookies) }));
vi.mock("@/libs/auth", () => ({
    getCurrentUser: vi.fn(async () => state.user),
    getDraftBusiness: vi.fn(async () => state.draft),
}));

import { ACTIVE_BUSINESS_COOKIE } from "@/libs/active-business";
import { checkSlugAvailability, completeOnboarding } from "./actions";

const input: OnboardingInput & { timezone: string } = {
    businessName: "Green Acres",
    trade: "lawn-care",
    phone: "512-555-0100",
    slug: "green-acres",
    services: [
        { name: "Weekly mow", price: 45, durationMinutes: 60, depositPercent: 0 },
        { name: "Leaf cleanup", price: 239.99, durationMinutes: 120, depositPercent: 25 },
    ],
    baseAddress: "1 Main St, Austin",
    serviceRadiusMiles: 15,
    workDays: [1, 3, 5],
    dayStart: "08:00",
    dayEnd: "17:00",
    timezone: "America/Chicago",
};

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.cookies = createCookieJar();
    state.user = { id: "u1" };
    state.draft = null;
    state.supabase.respond("businesses.insert", { data: { id: "new-biz" } });
    state.supabase.respond("businesses.update", { data: { id: "draft-biz" } });
});

describe("checkSlugAvailability", () => {
    it("rejects invalid slugs without hitting the database", async () => {
        expect(await checkSlugAvailability("Not OK!")).toEqual({ available: false, reason: expect.stringMatching(/lowercase/) });
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("rejects reserved slugs", async () => {
        expect((await checkSlugAvailability("dashboard")).available).toBe(false);
    });

    it("requires a session", async () => {
        state.user = null;
        expect(await checkSlugAvailability("green-acres")).toEqual({ available: false, reason: expect.stringMatching(/Log in/) });
    });

    it("reports a taken slug", async () => {
        state.supabase.rpc.mockResolvedValue({ data: false, error: null });
        expect(await checkSlugAvailability("green-acres")).toEqual({ available: false, reason: expect.stringMatching(/already has/) });
    });

    it("passes the draft being resumed so its own slug counts as free", async () => {
        state.draft = { id: "draft-biz", name: "Draft", slug: "green-acres", trade: "lawn-care" };
        state.supabase.rpc.mockResolvedValue({ data: true, error: null });
        expect(await checkSlugAvailability("Green-Acres")).toEqual({ available: true });
        expect(state.supabase.rpc).toHaveBeenCalledWith("is_slug_available", { p_slug: "green-acres", p_business_id: "draft-biz" });
    });

    it("doesn't block the user if the check itself fails", async () => {
        state.supabase.rpc.mockResolvedValue({ data: null, error: { message: "network" } });
        expect(await checkSlugAvailability("green-acres")).toEqual({ available: true });
    });
});

describe("completeOnboarding", () => {
    it("sends signed-out users to log in", async () => {
        state.user = null;
        await expectRedirect(completeOnboarding(input), "/auth/login?next=/onboarding");
    });

    it("re-validates on the server", async () => {
        const result = await completeOnboarding({ ...input, services: [] });
        expect(result).toEqual({ error: "Add at least one service." });
        expect(state.supabase.calls).toHaveLength(0);
    });

    it("creates a new business with services and hours, publishes it and makes it active", async () => {
        await expectRedirect(completeOnboarding(input), "/dashboard");

        const [insert] = state.supabase.callsTo("businesses", "insert");
        expect(insert.values).toEqual({
            owner_id: "u1",
            name: "Green Acres",
            slug: "green-acres",
            trade: "lawn-care",
            phone: "512-555-0100",
            timezone: "America/Chicago",
            base_address: "1 Main St, Austin",
            service_radius_miles: 15,
        });

        const [services] = state.supabase.callsTo("services", "insert");
        expect(services.values).toEqual([
            {
                business_id: "new-biz",
                name: "Weekly mow",
                price_cents: 4500,
                duration_minutes: 60,
                deposit_type: "none",
                deposit_percent: 0,
                sort_order: 0,
            },
            {
                business_id: "new-biz",
                name: "Leaf cleanup",
                price_cents: 23999,
                duration_minutes: 120,
                deposit_type: "percent",
                deposit_percent: 25,
                sort_order: 1,
            },
        ]);

        const [hours] = state.supabase.callsTo("business_hours", "insert");
        expect(hours.values).toEqual([1, 3, 5].map((weekday) => ({
            business_id: "new-biz",
            weekday,
            opens_at: "08:00",
            closes_at: "17:00",
        })));

        const [publish] = state.supabase.callsTo("businesses", "update");
        expect(publish.values).toMatchObject({ is_published: true, onboarding_completed_at: expect.any(String) });
        expect(publish.filters).toEqual([["eq", "id", "new-biz"]]);

        expect(state.cookies.values.get(ACTIVE_BUSINESS_COOKIE)).toBe("new-biz");
    });

    it("replaces services and hours rather than appending", async () => {
        await expectRedirect(completeOnboarding(input), "/dashboard");
        const order = state.supabase.calls.map((call) => `${call.table}.${call.op}`);
        expect(order.indexOf("services.delete")).toBeLessThan(order.indexOf("services.insert"));
        expect(order.indexOf("business_hours.delete")).toBeLessThan(order.indexOf("business_hours.insert"));
    });

    it("finishes a resumed draft instead of creating another business, without touching ownership", async () => {
        state.draft = { id: "draft-biz", name: "Draft", slug: "draft", trade: "lawn-care" };
        await expectRedirect(completeOnboarding(input), "/dashboard");

        expect(state.supabase.callsTo("businesses", "insert")).toHaveLength(0);
        const [details] = state.supabase.callsTo("businesses", "update");
        expect(details.values).not.toHaveProperty("owner_id");
        expect(details.filters).toEqual([["eq", "id", "draft-biz"]]);
        expect(state.cookies.values.get(ACTIVE_BUSINESS_COOKIE)).toBe("draft-biz");
    });

    it("flags a slug that was taken in the meantime", async () => {
        state.supabase = createSupabaseMock();
        state.supabase.respond("businesses.insert", { error: { code: "23505", message: "duplicate key" } });
        expect(await completeOnboarding(input)).toEqual({ error: expect.stringMatching(/just taken/), field: "slug" });
    });

    it("explains the per-owner business limit", async () => {
        state.supabase = createSupabaseMock();
        state.supabase.respond("businesses.insert", { error: { code: "P0001", message: "business_limit_reached" } });
        expect(await completeOnboarding(input)).toEqual({ error: expect.stringMatching(/limit of 25/) });
    });

    it("stops if services can't be saved, before publishing", async () => {
        state.supabase.respond("services.insert", { error: { message: "boom" } });
        expect(await completeOnboarding(input)).toEqual({ error: expect.stringMatching(/services/) });
        expect(state.supabase.callsTo("businesses", "update")).toHaveLength(0);
        expect(state.cookies.values.has(ACTIVE_BUSINESS_COOKIE)).toBe(false);
    });

    it("stops if hours can't be saved, before publishing", async () => {
        state.supabase.respond("business_hours.delete", { error: { message: "boom" } });
        expect(await completeOnboarding(input)).toEqual({ error: expect.stringMatching(/hours/) });
        expect(state.supabase.callsTo("business_hours", "insert")).toHaveLength(0);
        expect(state.supabase.callsTo("businesses", "update")).toHaveLength(0);
    });

    it("defaults the time zone to UTC", async () => {
        await expectRedirect(completeOnboarding({ ...input, timezone: undefined }), "/dashboard");
        expect(state.supabase.callsTo("businesses", "insert")[0].values).toMatchObject({ timezone: "UTC" });
    });
});
