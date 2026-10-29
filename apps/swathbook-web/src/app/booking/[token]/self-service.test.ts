// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const TOKEN = "a".repeat(64);
const state = vi.hoisted(() => ({ admin: null as unknown as SupabaseMock, sendSoon: vi.fn() }));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: state.sendSoon }));

import { cancelMyBooking, getRescheduleSlots, rescheduleMyBooking } from "./actions";

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.sendSoon.mockReset();
});

describe("customer self-service", () => {
    it("loads open times for one day", async () => {
        state.admin.rpc.mockResolvedValueOnce({ data: [{ slot_start: "2026-11-10T15:00:00Z", slot_end: "2026-11-10T16:00:00Z" }], error: null });
        expect(await getRescheduleSlots(TOKEN, "2026-11-10")).toEqual({ slots: [{ start: "2026-11-10T15:00:00Z", end: "2026-11-10T16:00:00Z" }] });
        expect(state.admin.rpc).toHaveBeenCalledWith("get_reschedule_slots", { p_token: TOKEN, p_from: "2026-11-10", p_days: 1 });
    });

    it("rejects bad tokens before touching the database", async () => {
        expect(await getRescheduleSlots("nope", "2026-11-10")).toEqual({ error: "Pick a day." });
        expect(await rescheduleMyBooking("nope", "2026-11-10T15:00:00Z")).toEqual({ error: "Pick a time." });
        expect(state.admin.rpc).not.toHaveBeenCalled();
    });

    it("moves the booking and sends the emails", async () => {
        expect(await rescheduleMyBooking(TOKEN, "2026-11-10T15:00:00Z")).toEqual({ ok: true });
        expect(state.admin.rpc).toHaveBeenCalledWith("customer_reschedule_booking", { p_token: TOKEN, p_start: "2026-11-10T15:00:00Z" });
        expect(state.sendSoon).toHaveBeenCalled();
    });

    it("explains why a move was refused", async () => {
        state.admin.rpc.mockResolvedValueOnce({ data: null, error: { message: "slot_unavailable" } });
        expect(await rescheduleMyBooking(TOKEN, "2026-11-10T15:00:00Z")).toEqual({ error: "Someone just took that time. Pick another one." });
        state.admin.rpc.mockResolvedValueOnce({ data: null, error: { message: "reschedule_not_allowed", details: "too_late" } as never });
        expect((await rescheduleMyBooking(TOKEN, "2026-11-10T15:00:00Z")) as { error: string }).toEqual({
            error: "It's too close to your appointment to change it online. Please contact the business.",
        });
    });

    it("cancels or asks to cancel, as the database decides", async () => {
        state.admin.rpc.mockResolvedValueOnce({ data: "requested", error: null });
        expect(await cancelMyBooking(TOKEN, "Moving away")).toEqual({ outcome: "requested" });
        expect(state.admin.rpc).toHaveBeenCalledWith("customer_cancel_booking", { p_token: TOKEN, p_reason: "Moving away" });
        state.admin.rpc.mockResolvedValueOnce({ data: null, error: { message: "cancel_not_allowed" } });
        expect((await cancelMyBooking(TOKEN, "")) as { error: string }).toEqual({ error: "This booking can't be cancelled online. Please contact the business." });
    });
});
