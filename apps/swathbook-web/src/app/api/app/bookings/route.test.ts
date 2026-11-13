// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    admin: null as unknown as SupabaseMock,
    user: null as unknown as SupabaseMock,
    authResponse: null as Response | null,
    placed: null as unknown,
}));

vi.mock("@/libs/app-api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/libs/app-api")>()),
    authenticateApp: vi.fn(async () =>
        state.authResponse
            ? { response: state.authResponse }
            : { user: { id: "u1", email: "Cara@Example.com" }, supabase: state.user.client },
    ),
}));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: vi.fn() }));
vi.mock("@/libs/public-booking", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/libs/public-booking")>()),
    placeBooking: vi.fn(async () => state.placed),
}));

import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { placeBooking } from "@/libs/public-booking";
import { POST } from "./route";

const SERVICE = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";
const body = {
    slug: "green-acres",
    serviceIds: [SERVICE],
    start: "2026-11-20T15:00:00.000Z",
    customer: { fullName: "Cara Customer", phone: "512-555-0101" },
    address: { line1: "1 Elm St", city: "Austin", region: "TX", postalCode: "78701" },
    notes: "Gate code 4410",
};

function post(payload: unknown) {
    return POST(new Request("http://localhost:3000/api/app/bookings", { method: "POST", body: JSON.stringify(payload) }));
}

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.user = createSupabaseMock();
    state.authResponse = null;
    state.placed = {
        ok: true,
        booking: { bookingId: "bk1", reference: "SB1", token: "a".repeat(64), status: "confirmed", totalCents: 4500, depositDueCents: 0, holdExpiresAt: null, stripeAccountId: null },
    };
    state.admin.respond("profiles.select", { data: { full_name: null, phone: null } });
    state.user.rpc.mockResolvedValue({ data: { id: "bk1", status: "confirmed" }, error: null });
    vi.mocked(placeBooking).mockClear();
    vi.mocked(sendQueuedEmailsSoon).mockClear();
});

describe("POST /api/app/bookings", () => {
    it("passes the sign-in response through", async () => {
        state.authResponse = new Response(null, { status: 401 });
        expect((await post(body)).status).toBe(401);
        expect(placeBooking).not.toHaveBeenCalled();
    });

    it("books with the verified login email, never one from the request", async () => {
        const response = await post({ ...body, customer: { ...body.customer, email: "someone-else@example.com" } });
        expect(response.status).toBe(201);
        expect(placeBooking).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: "green-acres",
                customer: { fullName: "Cara Customer", phone: "512-555-0101", email: "cara@example.com" },
                address: expect.objectContaining({ line1: "1 Elm St", postalCode: "78701", lat: null }),
                notes: "Gate code 4410",
            }),
        );
    });

    it("returns the booking as the app sees it, and where to pay or manage it", async () => {
        const response = await post(body);
        expect(await response.json()).toEqual({
            booking: { id: "bk1", status: "confirmed" },
            manageUrl: `http://localhost:3000/booking/${"a".repeat(64)}`,
        });
        expect(state.user.rpc).toHaveBeenCalledWith("my_booking", { p_booking_id: "bk1" });
        expect(sendQueuedEmailsSoon).toHaveBeenCalledWith("bk1");
    });

    it("fills in a blank profile name and phone", async () => {
        await post(body);
        expect(state.admin.calls.find((call) => call.table === "profiles" && call.op === "update")).toMatchObject({
            values: { full_name: "Cara Customer", phone: "512-555-0101" },
            filters: [["eq", "id", "u1"]],
        });
    });

    it("leaves a complete profile alone", async () => {
        state.admin = createSupabaseMock();
        state.admin.respond("profiles.select", { data: { full_name: "Cara P", phone: "512-555-9999" } });
        await post(body);
        expect(state.admin.calls.some((call) => call.op === "update")).toBe(false);
    });

    it("rejects a bad request without booking", async () => {
        const response = await post({ ...body, serviceIds: [] });
        expect(response.status).toBe(422);
        expect(placeBooking).not.toHaveBeenCalled();
    });

    it("explains a taken slot", async () => {
        state.placed = { ok: false, code: "slot_unavailable", error: "Someone just booked that time. Please pick another." };
        const response = await post(body);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ code: "slot_unavailable", error: "Someone just booked that time. Please pick another." });
        expect(sendQueuedEmailsSoon).not.toHaveBeenCalled();
    });
});
