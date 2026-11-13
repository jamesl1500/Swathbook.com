// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ user: null as unknown as SupabaseMock }));

vi.mock("@/libs/app-api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/libs/app-api")>()),
    authenticateApp: vi.fn(async () => ({ user: { id: "u1", email: "cara@example.com" }, supabase: state.user.client })),
}));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: vi.fn() }));

import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { POST as cancel } from "./cancel/route";
import { POST as reschedule } from "./reschedule/route";

const ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";
const context = (bookingId: string) => ({ params: Promise.resolve({ bookingId }) });
const call = (payload: unknown) => new Request("http://localhost/api/app", { method: "POST", body: JSON.stringify(payload) });

/** Script rpc results by function name. */
function rpcs(results: Record<string, { data?: unknown; error?: { message: string; details?: string } | null }>) {
    state.user.rpc.mockImplementation(async (fn: string) => ({ data: results[fn]?.data ?? null, error: results[fn]?.error ?? null }));
}

beforeEach(() => {
    state.user = createSupabaseMock();
    vi.mocked(sendQueuedEmailsSoon).mockClear();
});

describe("POST /api/app/bookings/:id/cancel", () => {
    it("cancels through cancel_my_booking and returns the updated booking", async () => {
        rpcs({ cancel_my_booking: { data: "requested" }, my_booking: { data: { id: ID, cancel_requested_at: "now" } } });
        const response = await cancel(call({ reason: "Plans changed" }), context(ID));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ outcome: "requested", booking: { id: ID, cancel_requested_at: "now" } });
        expect(state.user.rpc).toHaveBeenCalledWith("cancel_my_booking", { p_booking_id: ID, p_reason: "Plans changed" });
        expect(sendQueuedEmailsSoon).toHaveBeenCalledWith(ID);
    });

    it("404s for a booking that isn't theirs", async () => {
        rpcs({ cancel_my_booking: { error: { message: "booking_not_found" } } });
        expect((await cancel(call({}), context(ID))).status).toBe(404);
    });

    it("409s when the rules say no", async () => {
        rpcs({ cancel_my_booking: { error: { message: "cancel_not_allowed" } } });
        const response = await cancel(call({}), context(ID));
        expect(response.status).toBe(409);
        expect(sendQueuedEmailsSoon).not.toHaveBeenCalled();
    });

    it("ignores ids that aren't UUIDs", async () => {
        expect((await cancel(call({}), context("../../etc"))).status).toBe(404);
        expect(state.user.rpc).not.toHaveBeenCalled();
    });
});

describe("POST /api/app/bookings/:id/reschedule", () => {
    it("moves the booking through reschedule_my_booking", async () => {
        rpcs({ reschedule_my_booking: { data: "2026-11-21T15:00:00Z" }, my_booking: { data: { id: ID } } });
        const response = await reschedule(call({ start: "2026-11-21T15:00:00.000Z" }), context(ID));
        expect(response.status).toBe(200);
        expect(state.user.rpc).toHaveBeenCalledWith("reschedule_my_booking", { p_booking_id: ID, p_start: "2026-11-21T15:00:00.000Z" });
        expect(sendQueuedEmailsSoon).toHaveBeenCalledWith(ID);
    });

    it("explains why a move isn't allowed", async () => {
        rpcs({ reschedule_my_booking: { error: { message: "reschedule_not_allowed", details: "too_late" } } });
        const response = await reschedule(call({ start: "2026-11-21T15:00:00.000Z" }), context(ID));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: "too_late" });
    });

    it("needs a time", async () => {
        expect((await reschedule(call({ start: "tomorrow" }), context(ID))).status).toBe(422);
    });
});
