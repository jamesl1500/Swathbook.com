// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const BOOKING = "6f1c1b0e-6d2a-4a52-9b8e-6f1c1b0e6d2a";
const BUSINESS = "10000000-0000-0000-0000-000000000001";

const state = vi.hoisted(() => ({
    user: null as unknown as SupabaseMock,
    resolve: vi.fn(),
    sendSoon: vi.fn(),
}));

vi.mock("@/libs/app-api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/libs/app-api")>()),
    authenticateApp: vi.fn(async () => ({ user: { id: "owner-1", email: "olive@example.com" }, supabase: state.user.client })),
}));
vi.mock("@/libs/cancel-requests", () => ({ resolveCancelRequest: state.resolve }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: state.sendSoon }));

import { POST } from "./route";

function post(bookingId: string, body: unknown) {
    return POST(new Request(`http://localhost/api/owner/bookings/${bookingId}/cancel-request`, { method: "POST", body: JSON.stringify(body) }), {
        params: Promise.resolve({ bookingId }),
    });
}

beforeEach(() => {
    state.user = createSupabaseMock();
    state.user.respond("bookings.select", { data: { business_id: BUSINESS } });
    state.user.respond("business_members.select", { data: { role: "owner" } });
    state.resolve.mockReset().mockResolvedValue({ ok: true, message: "Booking cancelled. The customer has been emailed. Refund started." });
    state.sendSoon.mockReset();
});

describe("POST /api/owner/bookings/:id/cancel-request", () => {
    it("approves with a refund, as the signed-in owner, and sends the emails", async () => {
        const response = await post(BOOKING, { approve: true, refund: true });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "Booking cancelled. The customer has been emailed. Refund started." });
        expect(state.resolve).toHaveBeenCalledWith(state.user.client, { businessId: BUSINESS, userId: "owner-1" }, { bookingId: BOOKING, approve: true, refund: true, note: "" });
        expect(state.sendSoon).toHaveBeenCalledWith(BOOKING);
    });

    it("only acts within the caller's business", async () => {
        await post(BOOKING, { approve: false, note: "Let's move it instead" });
        expect(state.user.callsTo("business_members", "select")[0].filters).toEqual(
            expect.arrayContaining([
                ["eq", "business_id", BUSINESS],
                ["eq", "user_id", "owner-1"],
                ["eq", "status", "active"],
            ]),
        );
    });

    it("says not found for a bad id or a booking the caller can't see", async () => {
        expect((await post("nope", { approve: true })).status).toBe(404);
        state.user = createSupabaseMock();
        state.user.respond("bookings.select", { data: null });
        expect((await post(BOOKING, { approve: true })).status).toBe(404);
        expect(state.resolve).not.toHaveBeenCalled();
    });

    it("refuses crew and people outside the business", async () => {
        for (const member of [{ role: "crew" }, null]) {
            state.user = createSupabaseMock();
            state.user.respond("bookings.select", { data: { business_id: BUSINESS } });
            state.user.respond("business_members.select", { data: member });
            expect((await post(BOOKING, { approve: true })).status).toBe(403);
        }
        expect(state.resolve).not.toHaveBeenCalled();
    });

    it("rejects a malformed request", async () => {
        expect((await post(BOOKING, { approve: "yes" })).status).toBe(422);
        expect((await post(BOOKING, { approve: true, note: "x".repeat(501) })).status).toBe(422);
        expect(state.resolve).not.toHaveBeenCalled();
    });

    it("passes on a refusal, without sending emails", async () => {
        state.resolve.mockResolvedValueOnce({ ok: false, error: "That request was already answered." });
        const response = await post(BOOKING, { approve: true });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: "That request was already answered." });
        expect(state.sendSoon).not.toHaveBeenCalled();
    });
});
