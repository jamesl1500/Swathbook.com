// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock }));

vi.mock("./supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));

import { expectRedirect } from "@/test/next-mocks";
import { getCustomer, isUpcomingJob, loadMyJob, loadMyJobs, requireCustomer, splitJobs, type CustomerJob } from "./customer";

const NOW = Date.parse("2026-11-14T12:00:00Z");

function job(id: string, status: CustomerJob["status"], start: string, hours = 1): CustomerJob {
    const end = new Date(Date.parse(start) + hours * 3_600_000).toISOString();
    return { id, status, scheduled_start: start, scheduled_end: end } as CustomerJob;
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
});

describe("isUpcomingJob", () => {
    it("counts active jobs that haven't ended", () => {
        expect(isUpcomingJob(job("a", "confirmed", "2026-11-15T09:00:00Z"), NOW)).toBe(true);
        expect(isUpcomingJob(job("a", "requested", "2026-11-15T09:00:00Z"), NOW)).toBe(true);
        // In progress right now: still upcoming until it ends.
        expect(isUpcomingJob(job("a", "in_progress", "2026-11-14T11:30:00Z"), NOW)).toBe(true);
    });

    it("leaves out finished, cancelled and past jobs", () => {
        expect(isUpcomingJob(job("a", "cancelled", "2026-11-15T09:00:00Z"), NOW)).toBe(false);
        expect(isUpcomingJob(job("a", "completed", "2026-11-15T09:00:00Z"), NOW)).toBe(false);
        expect(isUpcomingJob(job("a", "confirmed", "2026-11-13T09:00:00Z"), NOW)).toBe(false);
    });
});

describe("splitJobs", () => {
    it("orders upcoming soonest first and past most recent first", () => {
        const jobs = [
            job("later", "confirmed", "2026-11-20T09:00:00Z"),
            job("old", "completed", "2026-10-01T09:00:00Z"),
            job("soon", "confirmed", "2026-11-15T09:00:00Z"),
            job("recent", "cancelled", "2026-11-10T09:00:00Z"),
        ];
        const { upcoming, past } = splitJobs(jobs, NOW);
        expect(upcoming.map((item) => item.id)).toEqual(["soon", "later"]);
        expect(past.map((item) => item.id)).toEqual(["recent", "old"]);
    });
});

describe("getCustomer / requireCustomer", () => {
    it("reads the verified claims", async () => {
        state.supabase.auth.getClaims.mockResolvedValueOnce({ data: { claims: { sub: "u1", email: "cara@example.com" } }, error: null });
        expect(await getCustomer()).toEqual({ id: "u1", email: "cara@example.com" });
    });

    it("sends signed-out visitors to the customer sign-in, remembering where they were going", async () => {
        await expectRedirect(requireCustomer("/my/jobs/abc"), "/my/sign-in?next=%2Fmy%2Fjobs%2Fabc");
    });
});

describe("loadMyJob", () => {
    it("never queries for an id that isn't a UUID", async () => {
        expect(await loadMyJob("../../etc")).toBeNull();
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("asks my_booking, which only answers for the caller's own bookings", async () => {
        const id = "6f1c1b0e-6d2a-4a52-9b8e-6f1c1b0e6d2a";
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
        expect(await loadMyJob(id)).toBeNull();
        expect(state.supabase.rpc).toHaveBeenCalledWith("my_booking", { p_booking_id: id });
    });
});

describe("loadMyJobs", () => {
    it("throws on failure so the page can say so", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
        await expect(loadMyJobs()).rejects.toThrow(/my_bookings failed/);
    });
});
