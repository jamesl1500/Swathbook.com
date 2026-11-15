import { describe, expect, it } from "vitest";
import { describeJobEvent, type JobEvent } from "./job-events";

const options = { timeZone: "America/Chicago", currency: "usd", team: [{ id: "m1", name: "Carl Crew" }] };
const event = (overrides: Partial<JobEvent>): JobEvent => ({ event_type: "created", from_status: null, to_status: null, data: {}, ...overrides });

describe("describeJobEvent", () => {
    it("says how the job was booked", () => {
        expect(describeJobEvent(event({ data: { source: "booking_page" } }), options).title).toBe("Booked online");
        expect(describeJobEvent(event({ data: { source: "manual" } }), options).title).toBe("Added by the team");
    });

    it("reads a paid deposit and other status changes", () => {
        expect(describeJobEvent(event({ event_type: "status_changed", from_status: "pending_payment", to_status: "confirmed" }), options)).toEqual({
            title: "Deposit paid",
            detail: "Booking confirmed",
        });
        expect(describeJobEvent(event({ event_type: "status_changed", from_status: "confirmed", to_status: "cancelled", data: { reason: "Rain" } }), options)).toEqual({
            title: "Cancelled",
            detail: "Rain",
        });
    });

    it("gives the new time, the new crew member and payment amounts", () => {
        expect(describeJobEvent(event({ event_type: "rescheduled", data: { to_start: "2026-11-18T20:30:00Z" } }), options).detail).toBe("Now Wed, Nov 18, 2:30 PM");
        expect(describeJobEvent(event({ event_type: "reassigned", data: { to_member_id: "m1" } }), options).detail).toBe("To Carl Crew");
        expect(describeJobEvent(event({ event_type: "reassigned", data: { to_member_id: null } }), options).detail).toBe("Now unassigned");
        expect(describeJobEvent(event({ event_type: "payment", data: { kind: "balance", amount_cents: 13500 } }), options)).toEqual({
            title: "Balance payment received",
            detail: "$135",
        });
    });

    it("covers cancellation requests", () => {
        expect(describeJobEvent(event({ event_type: "cancel_requested", data: { reason: "Moving" } }), options)).toEqual({
            title: "Customer asked to cancel",
            detail: "“Moving”",
        });
        expect(describeJobEvent(event({ event_type: "cancel_request_resolved", data: { approved: false, note: "Let's move it" } }), options)).toEqual({
            title: "Cancellation declined",
            detail: "Let's move it",
        });
    });
});
