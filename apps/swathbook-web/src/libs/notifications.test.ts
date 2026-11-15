import { describe, expect, it } from "vitest";
import { describeNotification, timeAgo, type NotificationItem } from "./notifications";

const TZ = "America/Chicago";

function item(overrides: Partial<NotificationItem>): NotificationItem {
    return {
        id: "1",
        type: "created",
        from_status: null,
        to_status: "confirmed",
        data: {},
        created_at: "2026-11-14T15:00:00Z",
        booking_id: "b1",
        reference: "AB12",
        scheduled_start: "2026-11-16T15:00:00Z",
        customer_name: "Pat Customer",
        unread: true,
        ...overrides,
    };
}

describe("describeNotification", () => {
    it("announces new bookings and requests, linking to the job", () => {
        expect(describeNotification(item({}), TZ)).toEqual({
            tone: "new",
            title: "New booking: Pat Customer",
            body: "Mon, Nov 16, 9:00 AM",
            href: "/dashboard/schedule/b1",
        });
        expect(describeNotification(item({ to_status: "requested" }), TZ).title).toBe("New request from Pat Customer");
    });

    it("treats a paid deposit as the booking arriving", () => {
        expect(describeNotification(item({ type: "status_changed", from_status: "pending_payment", to_status: "confirmed" }), TZ)).toMatchObject({
            title: "New booking: Pat Customer",
            body: "Deposit paid for Mon, Nov 16, 9:00 AM.",
        });
    });

    it("words payments, reschedules and cancellations", () => {
        expect(describeNotification(item({ type: "payment", data: { kind: "balance", amount_cents: 13500 } }), TZ).title).toBe("$135 received from Pat Customer");
        expect(describeNotification(item({ type: "rescheduled", data: { to_start: "2026-11-18T20:30:00Z" } }), TZ).body).toBe("Now Wed, Nov 18, 2:30 PM");
        expect(describeNotification(item({ type: "cancel_requested", data: { reason: "Moving" } }), TZ)).toMatchObject({
            tone: "warning",
            title: "Pat Customer asked to cancel",
            body: 'Mon, Nov 16, 9:00 AM · "Moving"',
        });
        expect(describeNotification(item({ type: "status_changed", from_status: "confirmed", to_status: "cancelled", data: { reason: "Rain" } }), TZ).body).toBe(
            "Mon, Nov 16, 9:00 AM · Rain",
        );
        expect(describeNotification(item({ type: "cancel_request_resolved", data: { approved: false } }), TZ).title).toBe("Pat Customer's cancellation was declined");
    });

    it("copes with a missing customer name", () => {
        expect(describeNotification(item({ customer_name: null }), TZ).title).toBe("New booking: A customer");
    });
});

describe("timeAgo", () => {
    const now = Date.parse("2026-11-14T15:00:00Z");
    it("says how long ago, briefly", () => {
        expect(timeAgo("2026-11-14T14:59:30Z", now)).toBe("just now");
        expect(timeAgo("2026-11-14T14:55:00Z", now)).toBe("5m");
        expect(timeAgo("2026-11-14T12:00:00Z", now)).toBe("3h");
        expect(timeAgo("2026-11-12T15:00:00Z", now)).toBe("2d");
    });
});
