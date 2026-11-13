// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID, form } from "@/test/dashboard";

const MEMBER_ID = "0b6b0a56-2d0f-4c3e-9f0a-6a1d2c3b4e5f";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    auth: {} as Record<string, unknown>,
    planDayRoute: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/routing/plan", () => ({ planDayRoute: state.planDayRoute }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import { planRoute, setStopStatus } from "./actions";

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.auth = { user: { id: "u1" }, role: "owner", businessId: BUSINESS_ID };
    state.supabase.respond("businesses.select", { data: { id: BUSINESS_ID, timezone: "America/Chicago" } });
    state.supabase.respond("business_members.select", { data: { id: MEMBER_ID } });
    state.planDayRoute.mockReset();
});

describe("planRoute", () => {
    it("summarizes the plan in plain language", async () => {
        state.planDayRoute.mockResolvedValue({ ok: true, routeId: "r1", stopCount: 5, excluded: ["Ada"], savedSeconds: 1_260, source: "google" });
        expect(await planRoute(form({ memberId: MEMBER_ID, date: "2026-11-10" }))).toEqual({
            success: "Planned 5 stops, saving about 21 min of driving, 1 without a mappable address were left off.",
        });
        expect(state.planDayRoute).toHaveBeenCalledWith(expect.anything(), { id: BUSINESS_ID, timezone: "America/Chicago" }, { memberId: MEMBER_ID, date: "2026-11-10" });
    });

    it("keeps it short when nothing was saved", async () => {
        state.planDayRoute.mockResolvedValue({ ok: true, routeId: "r1", stopCount: 1, excluded: [], savedSeconds: 0, source: "estimate" });
        expect(await planRoute(form({ memberId: MEMBER_ID, date: "2026-11-10" }))).toEqual({ success: "Planned 1 stop." });
    });

    it("passes planning errors through", async () => {
        state.planDayRoute.mockResolvedValue({ ok: false, error: "There are no confirmed jobs to route that day." });
        expect(await planRoute(form({ memberId: MEMBER_ID, date: "2026-11-10" }))).toEqual({ error: "There are no confirmed jobs to route that day." });
    });

    it("rejects bad input and members of other businesses", async () => {
        expect((await planRoute(form({ memberId: "nope", date: "2026-11-10" }))).error).toBe("Pick a crew member and a day.");

        state.supabase = createSupabaseMock();
        state.supabase.respond("businesses.select", { data: { id: BUSINESS_ID } });
        expect((await planRoute(form({ memberId: MEMBER_ID, date: "2026-11-10" }))).error).toBe("That crew member isn't part of this business.");
        expect(state.planDayRoute).not.toHaveBeenCalled();
    });
});

describe("setStopStatus", () => {
    it("lets crew update their stops through the database's own check", async () => {
        state.auth = { user: { id: "u2" }, role: "crew", businessId: BUSINESS_ID };
        expect(await setStopStatus(form({ stopId: "s1", status: "arrived" }))).toEqual({});
        expect(state.supabase.rpc).toHaveBeenCalledWith("update_route_stop_status", { p_stop_id: "s1", p_status: "arrived" });
    });

    it("explains someone else's stop and rejects unknown statuses", async () => {
        state.supabase.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
        expect((await setStopStatus(form({ stopId: "s1", status: "completed" }))).error).toMatch(/Only the assigned crew member/);
        expect((await setStopStatus(form({ stopId: "s1", status: "teleported" }))).error).toBe("Pick a valid status.");
    });
});
