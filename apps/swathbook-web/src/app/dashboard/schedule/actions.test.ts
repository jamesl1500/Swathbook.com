// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID, form } from "@/test/dashboard";

const MEMBER_ID = "0b6b0a56-2d0f-4c3e-9f0a-6a1d2c3b4e5f";
const MOW = "11111111-1111-4111-8111-111111111111";
const EDGE = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    admin: null as unknown as SupabaseMock,
    auth: {} as Record<string, unknown>,
    stripeConfigured: true,
    sendQueuedEmailsSoon: vi.fn(),
    refundsCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: state.sendQueuedEmailsSoon }));
vi.mock("@/libs/google/maps", () => ({ hasGoogleMaps: () => false, geocodeAddress: vi.fn(), placeDetails: vi.fn() }));
vi.mock("@/libs/stripe/server", () => ({
    hasStripe: () => state.stripeConfigured,
    getStripe: () => ({ refunds: { create: state.refundsCreate } }),
}));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import {
    addTimeOff,
    assignBooking,
    createManualBooking,
    deleteTimeOff,
    refundPayment,
    saveBookingRules,
    saveJobNotes,
    searchCustomers,
} from "./actions";

const PAYMENT = {
    id: "pay_1",
    business_id: BUSINESS_ID,
    amount_cents: 10_000,
    amount_refunded_cents: 2_500,
    stripe_payment_intent_id: "pi_1",
    stripe_account_id: "acct_1",
    status: "partially_refunded",
};

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.admin = createSupabaseMock();
    state.auth = { user: { id: "u1" }, role: "owner", businessId: BUSINESS_ID };
    state.stripeConfigured = true;
    state.sendQueuedEmailsSoon.mockReset();
    state.refundsCreate.mockReset().mockResolvedValue({ id: "re_1", amount: 7_500, status: "succeeded" });
});

describe("assignBooking", () => {
    it("assigns and unassigns within the business", async () => {
        expect(await assignBooking(form({ bookingId: "bk1", memberId: MEMBER_ID }))).toEqual({ success: "Job reassigned." });
        expect(await assignBooking(form({ bookingId: "bk1", memberId: "" }))).toEqual({ success: "Job unassigned." });

        const [assign, unassign] = state.supabase.callsTo("bookings", "update");
        expect(assign.values).toEqual({ assigned_member_id: MEMBER_ID });
        expect(assign.filters).toContainEqual(["eq", "business_id", BUSINESS_ID]);
        expect(unassign.values).toEqual({ assigned_member_id: null });
    });

    it("explains a double-booked crew member", async () => {
        state.supabase.respond("bookings.update", { error: { message: 'violates exclusion constraint "bookings_no_overlap_per_member"' } });
        expect((await assignBooking(form({ bookingId: "bk1", memberId: MEMBER_ID }))).error).toMatch(/overlaps another job/);
    });

    it("stops crew before touching the database", async () => {
        state.auth = { error: "Only owners and admins can change this." };
        expect(await assignBooking(form({ bookingId: "bk1", memberId: MEMBER_ID }))).toEqual({ error: "Only owners and admins can change this." });
        expect(state.supabase.calls).toHaveLength(0);
    });
});

describe("saveJobNotes", () => {
    it("caps notes at 5000 characters and clears empty notes", async () => {
        await saveJobNotes({}, form({ bookingId: "bk1", internalNotes: "x".repeat(6000) }));
        await saveJobNotes({}, form({ bookingId: "bk1", internalNotes: "" }));
        const [long, empty] = state.supabase.callsTo("bookings", "update");
        expect((long.values as { internal_notes: string }).internal_notes).toHaveLength(5000);
        expect(empty.values).toEqual({ internal_notes: null });
    });
});

describe("refundPayment", () => {
    it("refunds only what's left, on the connected account, idempotently", async () => {
        state.supabase.respond("payments.select", { data: PAYMENT });
        const result = await refundPayment(form({ paymentId: "pay_1" }));

        expect(result.success).toMatch(/Refund started/);
        expect(state.refundsCreate).toHaveBeenCalledWith(
            { payment_intent: "pi_1", amount: 7_500, reason: "requested_by_customer", metadata: { refunded_by: "u1" } },
            { stripeAccount: "acct_1", idempotencyKey: "refund:pay_1:7500" },
        );
        expect(state.admin.callsTo("refunds", "upsert")[0].values).toMatchObject({ payment_id: "pay_1", amount_cents: 7_500, status: "succeeded", stripe_refund_id: "re_1" });
        // The payment is looked up within the caller's business.
        expect(state.supabase.callsTo("payments", "select")[0].filters).toContainEqual(["eq", "business_id", BUSINESS_ID]);
    });

    it("records a refund Stripe hasn't finished as pending", async () => {
        state.supabase.respond("payments.select", { data: PAYMENT });
        state.refundsCreate.mockResolvedValue({ id: "re_2", amount: 7_500, status: "pending" });
        await refundPayment(form({ paymentId: "pay_1" }));
        expect(state.admin.callsTo("refunds", "upsert")[0].values).toMatchObject({ status: "pending" });
    });

    it("refuses payments that can't be refunded", async () => {
        state.supabase.respond("payments.select", { data: { ...PAYMENT, status: "requires_payment_method" } });
        expect((await refundPayment(form({ paymentId: "pay_1" }))).error).toBe("That payment can't be refunded.");

        state.supabase = createSupabaseMock();
        state.supabase.respond("payments.select", { data: { ...PAYMENT, amount_refunded_cents: 10_000 } });
        expect((await refundPayment(form({ paymentId: "pay_1" }))).error).toBe("That payment is already fully refunded.");

        state.supabase = createSupabaseMock();
        expect((await refundPayment(form({ paymentId: "someone-elses" }))).error).toBe("That payment can't be refunded.");
        expect(state.refundsCreate).not.toHaveBeenCalled();
    });

    it("reports Stripe failures without recording a refund", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        state.supabase.respond("payments.select", { data: PAYMENT });
        state.refundsCreate.mockRejectedValue(new Error("card_declined"));
        expect((await refundPayment(form({ paymentId: "pay_1" }))).error).toBe("Stripe couldn't refund that payment.");
        expect(state.admin.calls).toHaveLength(0);
    });

    it("needs Stripe configured", async () => {
        state.stripeConfigured = false;
        expect((await refundPayment(form({ paymentId: "pay_1" }))).error).toMatch(/aren't configured/);
    });
});

describe("searchCustomers", () => {
    it("searches this business by a cleaned-up term and shapes the results", async () => {
        state.supabase.respond("customers.select", {
            data: [
                {
                    id: "c1",
                    full_name: "Ada Lovelace",
                    email: "ada@example.com",
                    phone: null,
                    customer_addresses: [{ id: "a1", line1: "1 Main St", city: "Austin", is_primary: true }],
                },
            ],
        });
        const results = await searchCustomers(BUSINESS_ID, "  AD%a_ ");

        expect(results).toEqual([
            { id: "c1", fullName: "Ada Lovelace", email: "ada@example.com", phone: null, addresses: [{ id: "a1", line1: "1 Main St", city: "Austin", isPrimary: true }] },
        ]);
        const { filters } = state.supabase.callsTo("customers", "select")[0];
        expect(filters).toContainEqual(["eq", "business_id", BUSINESS_ID]);
        expect(filters).toContainEqual(["like", "search_text", "%ada%"]);
        expect(filters).toContainEqual(["limit", 8]);
    });

    it("lists the first customers when the term is empty, and nothing for crew", async () => {
        await searchCustomers(BUSINESS_ID, "   ");
        expect(state.supabase.callsTo("customers", "select")[0].filters.some(([name]) => name === "like")).toBe(false);

        state.auth = { error: "Only owners and admins can change this." };
        expect(await searchCustomers(BUSINESS_ID, "ada")).toEqual([]);
    });
});

describe("createManualBooking", () => {
    const SERVICES = [
        { id: MOW, name: "Mow", description: null, price_cents: 4_500, duration_minutes: 45 },
        { id: EDGE, name: "Edge", description: "Beds too", price_cents: 2_000, duration_minutes: 30 },
    ];

    /** Answers like the real query: only the requested ids, from this business. */
    function scriptServices(available = SERVICES) {
        state.supabase.respond("services.select", (call) => {
            const ids = (call.filters.find(([name]) => name === "in")?.[2] ?? []) as string[];
            return { data: available.filter((service) => ids.includes(service.id)) };
        });
    }

    function scriptHappyPath() {
        scriptServices();
        state.supabase.respond("businesses.select", { data: { timezone: "America/Chicago", currency: "usd" } });
        state.supabase.respond("bookings.insert", { data: { id: "bk_new" } });
    }

    const base = { customerId: "c1", addressId: "a1", date: "2026-11-10", time: "09:30", memberId: MEMBER_ID };

    it("books the services in the order picked, ending after their combined time", async () => {
        scriptHappyPath();
        await expectRedirect(createManualBooking({}, form({ ...base, serviceIds: [EDGE, MOW], internalNotes: "Gate code 1234" })), "/dashboard/schedule/bk_new");

        expect(state.supabase.callsTo("bookings", "insert")[0].values).toEqual({
            business_id: BUSINESS_ID,
            customer_id: "c1",
            address_id: "a1",
            assigned_member_id: MEMBER_ID,
            status: "confirmed",
            source: "manual",
            // 09:30 in Chicago (CST, UTC-6) for 45 + 30 minutes.
            scheduled_start: "2026-11-10T15:30:00.000Z",
            scheduled_end: "2026-11-10T16:45:00.000Z",
            currency: "usd",
            customer_notes: null,
            internal_notes: "Gate code 1234",
        });
        const items = state.supabase.callsTo("booking_items", "insert")[0].values as Array<Record<string, unknown>>;
        expect(items.map((item) => [item.name, item.sort_order, item.unit_price_cents])).toEqual([
            ["Edge", 0, 2_000],
            ["Mow", 1, 4_500],
        ]);
        expect(state.sendQueuedEmailsSoon).toHaveBeenCalledWith("bk_new");
    });

    it("creates a new customer and their first address as primary", async () => {
        scriptHappyPath();
        state.supabase.respond("customers.insert", { data: { id: "c_new" } });
        state.supabase.respond("customer_addresses.select", { count: 0 });
        state.supabase.respond("customer_addresses.insert", { data: { id: "a_new" } });

        const fields = {
            ...base,
            customerId: "",
            newCustomerName: "Grace Hopper",
            newCustomerEmail: "Grace@Example.com",
            addressId: "new",
            "address.line1": "42 Elm St",
            "address.city": "Austin",
            serviceIds: [MOW],
        };
        await expectRedirect(createManualBooking({}, form(fields)), "/dashboard/schedule/bk_new");

        expect(state.supabase.callsTo("customers", "insert")[0].values).toEqual({ business_id: BUSINESS_ID, full_name: "Grace Hopper", email: "grace@example.com", phone: null });
        expect(state.supabase.callsTo("customer_addresses", "insert")[0].values).toMatchObject({ customer_id: "c_new", line1: "42 Elm St", is_primary: true });
        expect(state.supabase.callsTo("bookings", "insert")[0].values).toMatchObject({ customer_id: "c_new", address_id: "a_new" });
    });

    it("asks for a customer, and points to search when the email already exists", async () => {
        expect((await createManualBooking({}, form({ ...base, customerId: "", serviceIds: [MOW] }))).fieldErrors?.customer).toEqual(["Pick a customer or enter a new one."]);

        state.supabase.respond("customers.insert", { error: { code: "23505", message: "duplicate key" } });
        const duplicate = await createManualBooking({}, form({ ...base, customerId: "", newCustomerName: "Ada", newCustomerEmail: "ada@example.com", serviceIds: [MOW] }));
        expect(duplicate.fieldErrors?.customer?.[0]).toMatch(/already exists/);
    });

    it("validates the form before writing anything", async () => {
        const result = await createManualBooking({}, form({ ...base, date: "next tuesday", time: "9am" }));
        expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["serviceIds", "date", "time"]));
        expect(state.supabase.calls).toHaveLength(0);
    });

    it("refuses services from another business", async () => {
        scriptServices([SERVICES[0]]);
        expect((await createManualBooking({}, form({ ...base, serviceIds: [MOW, EDGE] }))).error).toBe("One of those services no longer exists.");
        expect(state.supabase.callsTo("bookings", "insert")).toHaveLength(0);
    });

    it("explains overlaps and half-saved jobs", async () => {
        scriptServices();
        state.supabase.respond("bookings.insert", { error: { code: "23P01", message: "exclusion" } });
        expect((await createManualBooking({}, form({ ...base, serviceIds: [MOW] }))).error).toMatch(/overlaps another job/);

        state.supabase = createSupabaseMock();
        scriptHappyPath();
        state.supabase.respond("booking_items.insert", { error: { message: "boom" } });
        expect((await createManualBooking({}, form({ ...base, serviceIds: [MOW] }))).error).toMatch(/services couldn't be saved/);
    });
});

describe("saveBookingRules", () => {
    const rules = {
        bookingLeadTimeMinutes: "120",
        bookingWindowDays: "60",
        slotIntervalMinutes: "30",
        bufferMinutes: "15",
        arrivalWindowMinutes: "60",
        cancellationWindowHours: "24",
        depositRefundPolicy: "refundable_before_window",
        autoConfirm: "on",
    };

    it("saves the rules as numbers and booleans", async () => {
        expect(await saveBookingRules({}, form(rules))).toEqual({ success: "Booking rules saved." });
        const update = state.supabase.callsTo("businesses", "update")[0];
        expect(update.values).toEqual({
            booking_lead_time_minutes: 120,
            booking_window_days: 60,
            slot_interval_minutes: 30,
            buffer_minutes: 15,
            arrival_window_minutes: 60,
            cancellation_window_hours: 24,
            deposit_refund_policy: "refundable_before_window",
            auto_confirm: true,
            allow_customer_reschedule: false,
        });
        expect(update.filters).toContainEqual(["eq", "id", BUSINESS_ID]);
    });

    it("rejects odd slot sizes and out-of-range values", async () => {
        const result = await saveBookingRules({}, form({ ...rules, slotIntervalMinutes: "7", bookingWindowDays: "0", depositRefundPolicy: "sometimes" }));
        expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["slotIntervalMinutes", "bookingWindowDays", "depositRefundPolicy"]));
        expect(state.supabase.calls).toHaveLength(0);
    });
});

describe("time off", () => {
    it("blocks whole local days, including across a daylight-saving change", async () => {
        state.supabase.respond("businesses.select", { data: { timezone: "America/Chicago" } });
        // US clocks fall back on 2026-11-01.
        await addTimeOff({}, form({ startDate: "2026-10-31", endDate: "2026-11-01", memberId: "", reason: "Family trip" }));
        expect(state.supabase.callsTo("time_off", "insert")[0].values).toEqual({
            business_id: BUSINESS_ID,
            member_id: null,
            starts_at: "2026-10-31T05:00:00.000Z",
            ends_at: "2026-11-02T06:00:00.000Z",
            reason: "Family trip",
        });
    });

    it("won't end before it starts", async () => {
        const result = await addTimeOff({}, form({ startDate: "2026-11-05", endDate: "2026-11-04", memberId: "", reason: "" }));
        expect(result.fieldErrors?.endDate).toEqual(["End date can't be before the start."]);
    });

    it("deletes only this business's time off", async () => {
        expect(await deleteTimeOff(form({ timeOffId: "to_1" }))).toEqual({ success: "Time off removed." });
        expect(state.supabase.callsTo("time_off", "delete")[0].filters).toEqual([
            ["eq", "id", "to_1"],
            ["eq", "business_id", BUSINESS_ID],
        ]);
    });
});
