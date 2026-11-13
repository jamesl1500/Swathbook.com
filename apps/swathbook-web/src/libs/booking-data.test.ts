// @vitest-environment node
/**
 * Small loaders and rules around bookings: refund defaults, the public booking
 * page, customer booking tokens and team names.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    admin: null as unknown as SupabaseMock,
    hasAdmin: true,
}));

// React's cache() only memoizes inside a request; outside one it just calls through.
vi.mock("./supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => state.admin.client, hasAdminClient: () => state.hasAdmin }));

import { loadBookingPage, loadPausedBusinessName } from "./booking-page";
import { refundByDefault } from "./booking-policy";
import { isBookingToken, loadBookingOptions, loadCustomerBooking } from "./customer-booking";
import { loadTeam } from "./team";

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.admin = createSupabaseMock();
    state.hasAdmin = true;
});

describe("refundByDefault", () => {
    const start = "2026-11-10T15:00:00Z";

    it("follows the business's refund policy", () => {
        expect(refundByDefault("refundable", null, start, 24)).toBe(true);
        expect(refundByDefault("non_refundable", "2026-11-01T00:00:00Z", start, 24)).toBe(false);
    });

    it("refunds before-window requests only when made early enough", () => {
        expect(refundByDefault("refundable_before_window", "2026-11-09T15:00:00Z", start, 24)).toBe(true);
        expect(refundByDefault("refundable_before_window", "2026-11-09T15:00:01Z", start, 24)).toBe(false);
        expect(refundByDefault("refundable_before_window", null, start, 24)).toBe(false);
    });
});

describe("loadBookingPage", () => {
    it("asks the database only for well-formed slugs", async () => {
        state.supabase.rpc.mockResolvedValue({ data: { business: { name: "Green Acres" } }, error: null });
        expect(await loadBookingPage("green-acres")).toEqual({ business: { name: "Green Acres" } });
        expect(state.supabase.rpc).toHaveBeenCalledWith("get_booking_page", { p_slug: "green-acres" });

        for (const slug of ["ab", "-green", "green-", "Green", "green_acres", "a".repeat(41), "../etc"]) {
            expect(await loadBookingPage(slug)).toBeNull();
        }
        expect(state.supabase.rpc).toHaveBeenCalledTimes(1);
    });

    it("finds a paused business's name for a friendlier notice", async () => {
        state.admin.respond("businesses.select", { data: { name: "Green Acres" } });
        expect(await loadPausedBusinessName("green-acres")).toBe("Green Acres");
        expect(state.admin.callsTo("businesses", "select")[0].filters).toContainEqual(["not", "onboarding_completed_at", "is", null]);

        state.hasAdmin = false;
        expect(await loadPausedBusinessName("green-acres")).toBeNull();
    });
});

describe("customer booking tokens", () => {
    const TOKEN = "0f".repeat(32);

    it("accepts only 64 lowercase hex characters", () => {
        expect(isBookingToken(TOKEN)).toBe(true);
        for (const value of ["0F".repeat(32), "0f".repeat(31), `${TOKEN}0`, "g".repeat(64), 42, null]) expect(isBookingToken(value)).toBe(false);
    });

    it("never queries with a malformed token", async () => {
        expect(await loadCustomerBooking("nope")).toBeNull();
        expect(await loadBookingOptions("nope")).toBeNull();
        expect(state.admin.calls).toHaveLength(0);
        expect(state.admin.rpc).not.toHaveBeenCalled();
    });

    it("looks the booking up by its token", async () => {
        state.admin.respond("bookings.select", { data: { id: "bk1" } });
        state.admin.rpc.mockResolvedValue({ data: { can_cancel: true }, error: null });
        expect(await loadCustomerBooking(TOKEN)).toEqual({ id: "bk1" });
        expect(state.admin.callsTo("bookings", "select")[0].filters).toEqual([["eq", "public_token", TOKEN]]);
        expect(await loadBookingOptions(TOKEN)).toEqual({ can_cancel: true });
        expect(state.admin.rpc).toHaveBeenCalledWith("customer_booking_options", { p_token: TOKEN });
    });
});

describe("loadTeam", () => {
    it("names members from their membership, then profile, then a fallback, and colors them", async () => {
        state.supabase.respond("business_members.select", {
            data: [
                { id: "m1", user_id: "u1", role: "owner", display_name: null, calendar_color: null, is_bookable: true },
                { id: "m2", user_id: "u2", role: "crew", display_name: "Sam (mower)", calendar_color: "#ff0000", is_bookable: true },
                { id: "m3", user_id: "u3", role: "crew", display_name: null, calendar_color: null, is_bookable: false },
            ],
        });
        state.supabase.respond("profiles.select", { data: [{ id: "u1", full_name: "Olive Owner" }] });

        expect(await loadTeam("biz")).toEqual([
            { id: "m1", userId: "u1", name: "Olive Owner", role: "owner", color: "#1c3d70", isBookable: true },
            { id: "m2", userId: "u2", name: "Sam (mower)", role: "crew", color: "#ff0000", isBookable: true },
            { id: "m3", userId: "u3", name: "Crew member 3", role: "crew", color: "#0e7c86", isBookable: false },
        ]);
        expect(state.supabase.callsTo("business_members", "select")[0].filters).toContainEqual(["eq", "status", "active"]);
    });

    it("skips the profile lookup for an empty team", async () => {
        expect(await loadTeam("biz")).toEqual([]);
        expect(state.supabase.callsTo("profiles")).toHaveLength(0);
    });
});
