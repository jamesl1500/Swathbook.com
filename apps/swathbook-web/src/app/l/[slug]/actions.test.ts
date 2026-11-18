// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    session: null as unknown,
    stripeConfigured: false,
}));

vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.admin.client) }));
vi.mock("@/libs/google/maps", () => ({
    hasGoogleMaps: () => false,
    geocodeAddress: vi.fn(),
    placeDetails: vi.fn(),
}));
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => state.stripeConfigured, getStripe: () => ({}) }));
vi.mock("@/libs/stripe/payments", () => ({ createBookingPayment: vi.fn(async () => state.session) }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: vi.fn() }));
vi.mock("@/libs/rate-limit", () => ({ allowRequest: vi.fn(async () => true), RATE_LIMITED_MESSAGE: "Too many tries." }));

import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { createBookingPayment } from "@/libs/stripe/payments";
import { allowRequest } from "@/libs/rate-limit";
import { signLocation } from "@/libs/signing";
import { createClient } from "@/libs/supabase/server";
import { getAvailability, submitBooking, type BookingRequest } from "./actions";

const SERVICE = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";

const request: BookingRequest = {
    slug: "green-acres",
    serviceIds: [SERVICE],
    start: "2026-11-02T15:00:00.000Z",
    customer: { fullName: "Dana Field", email: "Dana@Example.com", phone: "" },
    address: { line1: "10 Oak Ln", city: "Austin", region: "TX", postalCode: "78701" },
    notes: "",
};

const created = {
    booking_id: "bk1",
    reference: "ABC12345",
    public_token: "a".repeat(64),
    status: "confirmed",
    total_cents: 4500,
    deposit_due_cents: 0,
    hold_expires_at: null,
    stripe_account_id: null,
    customer_id: "c1",
};

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.admin.respond("businesses.select", { data: { id: "b1" } });
    state.admin.rpc.mockResolvedValue({ data: [created], error: null });
    state.stripeConfigured = false;
    state.session = null;
});

describe("submitBooking", () => {
    it("stops one visitor flooding a business's calendar", async () => {
        vi.mocked(allowRequest).mockResolvedValueOnce(false);
        expect(await submitBooking(request)).toEqual({ ok: false, error: "Too many tries.", code: "rate_limited" });
        expect(allowRequest).toHaveBeenCalledWith("booking", { scope: "green-acres" });
        expect(state.admin.rpc).not.toHaveBeenCalled();
    });

    it("books through create_booking with a normalized customer and address", async () => {
        expect(await submitBooking(request)).toEqual({ ok: true, token: "a".repeat(64), payment: null });
        expect(state.admin.rpc).toHaveBeenCalledWith("create_booking", {
            p_business_id: "b1",
            p_service_ids: [SERVICE],
            p_start: request.start,
            p_customer: { full_name: "Dana Field", email: "dana@example.com", phone: "" },
            p_address: { line1: "10 Oak Ln", line2: "", city: "Austin", region: "TX", postal_code: "78701", country: "US", lat: null, lng: null },
            p_customer_notes: undefined,
            p_source: "booking_page",
            p_answers: [],
        });
        expect(createBookingPayment).not.toHaveBeenCalled();
    });

    it("starts the deposit payment when one is due", async () => {
        state.stripeConfigured = true;
        state.session = { clientSecret: "pi_secret", stripeAccountId: "acct_1", amountCents: 1500, kind: "deposit" };
        state.admin.rpc.mockResolvedValue({ data: [{ ...created, status: "pending_payment", deposit_due_cents: 1500, stripe_account_id: "acct_1" }], error: null });
        const result = await submitBooking(request);
        expect(result).toEqual({ ok: true, token: "a".repeat(64), payment: state.session });
        expect(sendQueuedEmailsSoon).toHaveBeenCalled();
        expect(createBookingPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), { bookingId: "bk1", kind: "deposit" });
    });

    it("rejects bots that fill the honeypot", async () => {
        const result = await submitBooking({ ...request, company: "Spam Inc" });
        expect(result.ok).toBe(false);
        expect(state.admin.rpc).not.toHaveBeenCalled();
    });

    it("returns field errors for bad input", async () => {
        const result = await submitBooking({ ...request, customer: { fullName: "", email: "nope", phone: "" } });
        expect(result).toMatchObject({
            ok: false,
            fieldErrors: { "customer.fullName": ["Enter your name."], "customer.email": ["Enter a valid email."] },
        });
    });

    it("says so when the business isn't taking bookings", async () => {
        state.admin = createSupabaseMock();
        expect(await submitBooking(request)).toEqual({ ok: false, code: "business_not_found", error: expect.stringMatching(/isn.t taking bookings/) });
    });

    it.each([
        ["slot_unavailable", /just booked/],
        ["outside_service_area", /service area/],
        ["invalid_services", /no longer available/],
    ])("explains %s from the database", async (code, message) => {
        state.admin.rpc.mockResolvedValue({ data: null, error: { message: code } });
        expect(await submitBooking(request)).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    });
});

describe("getAvailability", () => {
    it("returns the open slots", async () => {
        state.admin.rpc.mockResolvedValue({ data: [{ slot_start: "s", slot_end: "e" }], error: null });
        expect(await getAvailability({ slug: "green-acres", serviceIds: [SERVICE], from: "2026-11-02" })).toEqual({ slots: [{ start: "s", end: "e", neighborDiscountPercent: 0 }] });
        expect(state.admin.rpc).toHaveBeenCalledWith("get_available_slots", { p_slug: "green-acres", p_service_ids: [SERVICE], p_from: "2026-11-02", p_days: 7 });
    });

    it("asks about neighbors only for a location the server signed, and as the server", async () => {
        vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
        state.admin.rpc.mockResolvedValue({ data: [], error: null });
        const locationToken = signLocation({ lat: 30.27, lng: -97.74 }, { line1: "1 Main St", postalCode: "78701" })!;
        vi.mocked(createClient).mockClear();
        await getAvailability({ slug: "green-acres", serviceIds: [SERVICE], from: "2026-11-02", locationToken });
        expect(state.admin.rpc).toHaveBeenLastCalledWith("get_available_slots", expect.objectContaining({ p_lat: 30.27, p_lng: -97.74 }));
        expect(createClient).not.toHaveBeenCalled();

        await getAvailability({ slug: "green-acres", serviceIds: [SERVICE], from: "2026-11-02", locationToken: "30.27,-97.74|x|9999999999|forged" });
        expect(state.admin.rpc).toHaveBeenLastCalledWith("get_available_slots", expect.not.objectContaining({ p_lat: expect.anything() }));
        expect(createClient).toHaveBeenCalled();
        vi.unstubAllEnvs();
    });

    it("validates its input", async () => {
        expect(await getAvailability({ slug: "green-acres", serviceIds: [], from: "2026-11-02" })).toEqual({ error: expect.any(String) });
        expect(await getAvailability({ slug: "green-acres", serviceIds: [SERVICE], from: "2026-02-30" })).toEqual({ error: expect.any(String) });
    });
});
