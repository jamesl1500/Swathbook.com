// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    auth: { user: { id: "u1" }, role: "owner", businessId: "", business: { slug: "green-acres", name: "Green Acres" } } as Record<string, unknown>,
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: vi.fn() }));
const stripe = vi.hoisted(() => ({ refunds: { create: vi.fn(async () => ({ id: "re_1", amount: 4500, status: "succeeded" })) } }));
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => true, getStripe: () => stripe }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => createSupabaseMock().client }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", () => ({
    authorizeBusiness: vi.fn(async () => state.auth),
    isFailure: (value: unknown) => typeof value === "object" && value !== null && "error" in value,
}));

import { authorizeBusiness } from "@/libs/dashboard";
import { saveService } from "./services/actions";
import { updateBookingPage } from "./link/actions";
import { rescheduleBooking, resolveCancellation, saveHours, updateJobStatus } from "./schedule/actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set("businessId", BUSINESS_ID);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.auth = { user: { id: "u1" }, role: "owner", businessId: BUSINESS_ID, business: { slug: "green-acres", name: "Green Acres" } };
});

describe("saveService", () => {
    const valid = { name: "Weekly mow", price: "45", priceType: "fixed", durationMinutes: "60", depositType: "none", isActive: "on", isPublic: "on" };

    it("creates a service in cents at the end of the list", async () => {
        state.supabase.respond("services.select", { data: null });
        const result = await saveService({}, form(valid));
        expect(result).toEqual({ success: "Service added." });
        expect(state.supabase.callsTo("services", "insert")[0].values).toMatchObject({
            business_id: BUSINESS_ID,
            name: "Weekly mow",
            price_cents: 4500,
            duration_minutes: 60,
            deposit_type: "none",
            deposit_percent: 0,
            deposit_amount_cents: 0,
            is_active: true,
            is_public: true,
        });
    });

    it("stores a percent deposit and clears the flat amount", async () => {
        await saveService({}, form({ ...valid, depositType: "percent", depositPercent: "25", depositAmount: "10" }));
        expect(state.supabase.callsTo("services", "insert")[0].values).toMatchObject({ deposit_type: "percent", deposit_percent: 25, deposit_amount_cents: 0 });
    });

    it("updates an existing service in place", async () => {
        await saveService({}, form({ ...valid, serviceId: "svc-1", price: "50.50" }));
        const [update] = state.supabase.callsTo("services", "update");
        expect(update.values).toMatchObject({ price_cents: 5050 });
        expect(update.filters).toEqual([
            ["eq", "id", "svc-1"],
            ["eq", "business_id", BUSINESS_ID],
        ]);
    });

    it.each([
        [{ name: "x" }, "name"],
        [{ price: "abc" }, "priceCents"],
        [{ depositType: "percent", depositPercent: "0" }, "depositPercent"],
        [{ depositType: "fixed", depositAmount: "100" }, "depositCents"],
    ])("validates %j", async (override, field) => {
        const result = await saveService({}, form({ ...valid, ...override }));
        expect(result.fieldErrors?.[field]).toBeDefined();
        expect(state.supabase.calls).toHaveLength(0);
    });

    it("only lets owners and admins edit services", async () => {
        vi.mocked(authorizeBusiness).mockResolvedValueOnce({ error: "Only owners and admins can change this." });
        expect(await saveService({}, form(valid))).toEqual({ error: "Only owners and admins can change this." });
    });
});

describe("updateBookingPage", () => {
    const valid = { name: "Green Acres", slug: "green-acres", description: "", phone: "", email: "", websiteUrl: "greenacres.com", brandColor: "#1c3d70" };

    it("saves the page and normalizes the website and color", async () => {
        const result = await updateBookingPage({}, form(valid));
        expect(result).toEqual({ success: "Booking page saved." });
        expect(state.supabase.callsTo("businesses", "update")[0].values).toMatchObject({
            website_url: "https://greenacres.com",
            brand_color: "#1c3d70",
            description: null,
        });
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("checks a new link is free for this business before saving", async () => {
        state.supabase.rpc.mockResolvedValue({ data: false, error: null });
        const result = await updateBookingPage({}, form({ ...valid, slug: "taken-link" }));
        expect(result.fieldErrors?.slug?.[0]).toMatch(/already has that link/);
        expect(state.supabase.rpc).toHaveBeenCalledWith("is_slug_available", { p_slug: "taken-link", p_business_id: BUSINESS_ID });
        expect(state.supabase.callsTo("businesses", "update")).toHaveLength(0);
    });

    it("warns that a changed link breaks old shares", async () => {
        state.supabase.rpc.mockResolvedValue({ data: true, error: null });
        expect((await updateBookingPage({}, form({ ...valid, slug: "new-link" }))).success).toMatch(/update anywhere you've shared/);
    });

    it("rejects reserved links", async () => {
        expect((await updateBookingPage({}, form({ ...valid, slug: "dashboard" }))).fieldErrors?.slug).toBeDefined();
    });
});

describe("schedule actions", () => {
    it("maps job status errors to plain language", async () => {
        state.supabase.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
        expect(await updateJobStatus(form({ bookingId: "bk1", status: "completed" }))).toEqual({ error: expect.stringMatching(/assigned to you/) });
        state.supabase.rpc.mockResolvedValue({ data: null, error: { message: "Invalid booking status change: completed -> confirmed" } });
        expect(await updateJobStatus(form({ bookingId: "bk1", status: "confirmed" }))).toEqual({ error: expect.stringMatching(/can't move to that status/) });
        expect(await updateJobStatus(form({ bookingId: "bk1", status: "deleted" }))).toEqual({ error: "Pick a valid status." });
    });

    it("reschedules in the business's time zone and explains overlaps", async () => {
        state.supabase.respond("businesses.select", { data: { timezone: "America/Chicago" } });
        state.supabase.respond(
            "bookings.update",
            { error: null },
            { error: { code: "23P01", message: "conflicting key value violates exclusion constraint" } },
        );
        await rescheduleBooking({}, form({ bookingId: "bk1", date: "2026-11-02", time: "09:00", durationMinutes: "90" }));
        expect(state.supabase.callsTo("bookings", "update")[0].values).toEqual({
            scheduled_start: "2026-11-02T15:00:00.000Z",
            scheduled_end: "2026-11-02T16:30:00.000Z",
        });

        expect(await rescheduleBooking({}, form({ bookingId: "bk1", date: "2026-11-02", time: "09:00", durationMinutes: "90" }))).toEqual({
            error: expect.stringMatching(/overlaps another job/),
        });
    });

    it("saves hours for open days only and validates each day", async () => {
        const days = form({ "open-1": "on", "opens-1": "08:00", "closes-1": "17:00", "open-2": "on", "opens-2": "09:00", "closes-2": "08:00" });
        const invalidResult = await saveHours({}, days);
        expect(invalidResult.fieldErrors?.["day-2"]).toBeDefined();
        expect(state.supabase.calls).toHaveLength(0);

        const result = await saveHours({}, form({ "open-1": "on", "opens-1": "08:00", "closes-1": "17:00" }));
        expect(result).toEqual({ success: "Hours saved." });
        expect(state.supabase.callsTo("business_hours", "insert")[0].values).toEqual([
            { business_id: BUSINESS_ID, weekday: 1, opens_at: "08:00", closes_at: "17:00" },
        ]);
    });
});

describe("resolveCancellation", () => {
    it("approves and refunds what was paid", async () => {
        state.supabase.respond("payments.select", { data: [{ id: "pay_1" }] }, {
            data: { id: "pay_1", business_id: BUSINESS_ID, amount_cents: 4500, amount_refunded_cents: 0, stripe_payment_intent_id: "pi_1", stripe_account_id: "acct_1", status: "succeeded" },
        });
        const result = await resolveCancellation(form({ bookingId: "bk_1", approve: "1", refund: "on" }));
        expect(state.supabase.rpc).toHaveBeenCalledWith("resolve_cancel_request", { p_booking_id: "bk_1", p_approve: true, p_note: undefined });
        expect(stripe.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: "pi_1", amount: 4500 }),
            expect.objectContaining({ stripeAccount: "acct_1" }),
        );
        expect(result.success).toBe("Booking cancelled. The customer has been emailed. Refund started.");
    });

    it("declines with a note and refunds nothing", async () => {
        stripe.refunds.create.mockClear();
        const result = await resolveCancellation(form({ bookingId: "bk_1", approve: "0", note: "Let's move it instead" }));
        expect(state.supabase.rpc).toHaveBeenCalledWith("resolve_cancel_request", { p_booking_id: "bk_1", p_approve: false, p_note: "Let's move it instead" });
        expect(stripe.refunds.create).not.toHaveBeenCalled();
        expect(result.success).toMatch(/declined/);
    });

    it("says when someone already answered", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "no_cancel_request" } });
        expect((await resolveCancellation(form({ bookingId: "bk_1", approve: "1" }))).error).toBe("That request was already answered.");
    });
});
