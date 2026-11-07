// @vitest-environment node
/**
 * submitBooking with Google Maps and Stripe turned on: locating the address,
 * mapping database errors, and starting the deposit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    placeDetails: vi.fn(),
    geocodeAddress: vi.fn(),
    createBookingPayment: vi.fn(),
    sendSoon: vi.fn(),
}));

vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.admin.client) }));
vi.mock("@/libs/google/maps", () => ({ hasGoogleMaps: () => true, geocodeAddress: state.geocodeAddress, placeDetails: state.placeDetails }));
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => true, getStripe: () => ({}) }));
vi.mock("@/libs/stripe/payments", () => ({ createBookingPayment: state.createBookingPayment }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: state.sendSoon }));

import { submitBooking, type BookingRequest } from "./actions";

const request: BookingRequest = {
    slug: "green-acres",
    serviceIds: ["6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69"],
    start: "2026-11-02T15:00:00.000Z",
    customer: { fullName: "Dana Field", email: "dana@example.com", phone: "" },
    address: { line1: "10 Oak Ln", city: "Austin", region: "TX", postalCode: "78701" },
    notes: "",
};

const created = { booking_id: "bk1", public_token: "a".repeat(64), deposit_due_cents: 0, stripe_account_id: null };

const sentAddress = () => (state.admin.rpc.mock.calls[0][1] as { p_address: { lat: number | null; lng: number | null } }).p_address;

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.admin.respond("businesses.select", { data: { id: "b1" } });
    state.admin.respond("bookings.select", { data: { address_id: "addr1" } });
    state.admin.rpc.mockResolvedValue({ data: [created], error: null });
    state.placeDetails.mockReset().mockResolvedValue(null);
    state.geocodeAddress.mockReset().mockResolvedValue(null);
    state.createBookingPayment.mockReset();
    state.sendSoon.mockReset();
});

describe("submitBooking locating the address", () => {
    it("uses the picked place's coordinates and remembers the place on the address", async () => {
        state.placeDetails.mockResolvedValue({ lat: 30.1, lng: -97.1, formatted: "10 Oak Ln, Austin, TX 78701, USA" });
        await submitBooking({ ...request, address: { ...request.address, placeId: "pl_1" } });

        expect(state.placeDetails).toHaveBeenCalledWith("pl_1");
        expect(state.geocodeAddress).not.toHaveBeenCalled();
        expect(sentAddress()).toMatchObject({ lat: 30.1, lng: -97.1 });
        expect(state.admin.callsTo("customer_addresses", "update")[0]).toMatchObject({
            values: { google_place_id: "pl_1", formatted_address: "10 Oak Ln, Austin, TX 78701, USA" },
            filters: [["eq", "id", "addr1"]],
        });
    });

    it("geocodes a typed address", async () => {
        state.geocodeAddress.mockResolvedValue({ lat: 30.2, lng: -97.2, placeId: "pl_geo", formatted: "Formatted" });
        await submitBooking(request);
        expect(state.geocodeAddress).toHaveBeenCalledWith("10 Oak Ln, Austin, TX, 78701");
        expect(sentAddress()).toMatchObject({ lat: 30.2, lng: -97.2 });
        expect(state.admin.callsTo("customer_addresses", "update")[0].values).toEqual({ google_place_id: "pl_geo", formatted_address: "Formatted" });
    });

    it("trusts coordinates the browser already sent", async () => {
        await submitBooking({ ...request, address: { ...request.address, lat: 30.3, lng: -97.3 } });
        expect(state.placeDetails).not.toHaveBeenCalled();
        expect(state.geocodeAddress).not.toHaveBeenCalled();
        expect(sentAddress()).toMatchObject({ lat: 30.3, lng: -97.3 });
        expect(state.admin.callsTo("customer_addresses", "update")).toHaveLength(0);
    });

    it("still books when the address can't be found (the database decides on service area)", async () => {
        expect((await submitBooking(request)).ok).toBe(true);
        expect(sentAddress()).toMatchObject({ lat: null, lng: null });
    });
});

describe("submitBooking errors and deposits", () => {
    it("turns database errors into plain language", async () => {
        const cases: Array<[string, RegExp]> = [
            ["slot_unavailable", /just booked/],
            ["outside_service_area", /outside this business's service area/],
            ["invalid_services", /no longer available/],
        ];
        for (const [code, message] of cases) {
            state.admin.rpc.mockResolvedValueOnce({ data: null, error: { message: `ERROR: ${code}` } });
            const result = await submitBooking(request);
            expect(result.ok === false && result.error).toMatch(message);
        }
    });

    it("hides unexpected errors behind a generic message", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        state.admin.rpc.mockResolvedValueOnce({ data: null, error: { message: "deadlock detected" } });
        expect(await submitBooking(request)).toEqual({ ok: false, error: "We couldn't complete your booking. Please try again." });
        expect(log).toHaveBeenCalled();

        state.admin.rpc.mockResolvedValueOnce({ data: [], error: null });
        expect((await submitBooking(request)).ok).toBe(false);
        expect(state.sendSoon).not.toHaveBeenCalled();
    });

    it("only offers a deposit form when Stripe gives back a session", async () => {
        state.admin.rpc.mockResolvedValue({ data: [{ ...created, deposit_due_cents: 1_000, stripe_account_id: "acct_1" }], error: null });
        state.createBookingPayment.mockResolvedValueOnce({ clientSecret: "cs_1", stripeAccountId: "acct_1", amountCents: 1_000 });
        expect(await submitBooking(request)).toMatchObject({ ok: true, payment: { clientSecret: "cs_1" } });
        expect(state.createBookingPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), { bookingId: "bk1", kind: "deposit" });

        state.createBookingPayment.mockResolvedValueOnce({ error: "Payments are off" });
        expect(await submitBooking(request)).toMatchObject({ ok: true, payment: null });
        expect(state.sendSoon).toHaveBeenCalledTimes(2);
    });

    it("skips the deposit when the business has no Stripe account", async () => {
        state.admin.rpc.mockResolvedValue({ data: [{ ...created, deposit_due_cents: 1_000, stripe_account_id: null }], error: null });
        expect(await submitBooking(request)).toMatchObject({ ok: true, payment: null });
        expect(state.createBookingPayment).not.toHaveBeenCalled();
    });
});
