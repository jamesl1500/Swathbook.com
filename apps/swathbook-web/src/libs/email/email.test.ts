// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("./send", async (original) => ({ ...(await original<typeof import("./send")>()), sendEmail }));

import { escapeHtml, renderEmail } from "./layout";
import { bookingTemplates, teamInviteEmail, type BookingEmailContext } from "./templates";
import { processNotifications, staleReason } from "./worker";

const context: BookingEmailContext = {
    baseUrl: "https://swathbook.test",
    business: { name: "Shine On", slug: "shine-on", brandColor: "#f2b705", timezone: "America/Chicago", phone: "512-555-0100", email: "hi@shine.test", cancellationWindowHours: 24 },
    customer: { name: "Pat", fullName: "Pat Customer" },
    booking: {
        id: "b1",
        reference: "AB12CD34",
        publicToken: "t".repeat(64),
        start: "2026-11-10T15:00:00Z",
        end: "2026-11-10T16:00:00Z",
        currency: "usd",
        totalCents: 18000,
        depositDueCents: 4500,
        depositPaidCents: 0,
        holdExpiresAt: "2026-11-01T18:30:00Z",
        cancellationReason: null,
    },
    services: ["Full interior detail"],
    address: "9 Oak Ln, Austin, TX",
    payload: {},
};

describe("email layout", () => {
    it("escapes everything a customer or business typed", () => {
        expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
        const { html } = renderEmail({ preheader: "p", sender: { name: "<b>Evil</b>" }, heading: "Hi", paragraphs: ["<img src=x>"] });
        expect(html).not.toContain("<b>Evil</b>");
        expect(html).not.toContain("<img src=x>");
    });

    it("uses readable text on a pale brand color", () => {
        const { html } = renderEmail({ preheader: "", sender: { name: "Gold Co", color: "#f2b705" }, heading: "Hi", paragraphs: [] });
        expect(html).toContain("background:#f2b705;color:#14202e");
    });

    it("has a plain-text twin with the button link", () => {
        const { text } = renderEmail({ preheader: "", sender: { name: "Shine On" }, heading: "Hi", paragraphs: ["Body"], button: { label: "Pay", url: "https://x.test/pay" } });
        expect(text).toContain("Pay: https://x.test/pay");
    });
});

describe("templates", () => {
    it("renders every booking template with the time in the business's zone", () => {
        for (const [name, template] of Object.entries(bookingTemplates)) {
            const email = template(context);
            expect(email.subject, name).toBeTruthy();
            expect(email.html, name).toContain("Shine On");
            expect(email.text, name).not.toContain("undefined");
        }
        expect(bookingTemplates["booking.confirmed"](context).subject).toBe("You're booked with Shine On · Tuesday, November 10 at 9:00 AM");
    });

    it("tells the customer exactly when the deposit hold ends", () => {
        const email = bookingTemplates["booking.deposit_reminder"](context);
        // 18:30 UTC is 12:30 PM in Chicago once daylight saving ends (Nov 1, 2026).
        expect(email.text).toContain("until 12:30 PM");
        expect(email.text).toContain(`Pay $45 deposit: https://swathbook.test/booking/${"t".repeat(64)}`);
        expect(email.replyTo).toBe("hi@shine.test");
    });

    it("points owners at the job in their dashboard", () => {
        expect(bookingTemplates["owner.new_booking"](context).text).toContain("https://swathbook.test/dashboard/schedule/b1");
    });

    it("invites teammates with their role spelled out", () => {
        const email = teamInviteEmail({ businessName: "Shine On", inviterName: "Olive", role: "crew", url: "https://swathbook.test/invite/abc" });
        expect(email.subject).toBe("Olive invited you to Shine On on Swathbook");
        expect(email.text).toContain("as part of the crew");
    });
});

describe("staleReason", () => {
    const now = Date.parse("2026-11-01T18:00:00Z");
    it("drops deposit reminders once the deposit is resolved or the hold is over", () => {
        expect(staleReason("booking.deposit_reminder", "pending_payment", context, now)).toBeNull();
        expect(staleReason("booking.deposit_reminder", "confirmed", context, now)).toBe("deposit already resolved");
        expect(staleReason("booking.deposit_reminder", "pending_payment", context, Date.parse("2026-11-01T19:00:00Z"))).toBe("hold expired");
    });

    it("doesn't confirm a booking that was cancelled in the meantime", () => {
        expect(staleReason("booking.confirmed", "cancelled", context, now)).toBe("booking was cancelled");
        expect(staleReason("booking.cancelled", "cancelled", context, now)).toBeNull();
    });
});

describe("processNotifications", () => {
    let admin: SupabaseMock;
    const row = (template: string, extra: Record<string, unknown> = {}) => ({
        id: `n-${template}`,
        booking_id: "b1",
        template,
        to_address: "pat@example.com",
        attempts: 1,
        payload: {},
        ...extra,
    });
    const booking = {
        id: "b1",
        reference: "AB12CD34",
        public_token: "t".repeat(64),
        status: "confirmed",
        scheduled_start: "2026-11-10T15:00:00Z",
        scheduled_end: "2026-11-10T16:00:00Z",
        currency: "usd",
        total_cents: 18000,
        deposit_due_cents: 4500,
        deposit_paid_cents: 4500,
        hold_expires_at: null,
        cancellation_reason: null,
        businesses: { name: "Shine On", slug: "shine-on", brand_color: null, timezone: "America/Chicago", phone: null, email: null, cancellation_window_hours: 24 },
        customers: { full_name: "Pat Customer" },
        customer_addresses: { line1: "9 Oak Ln", city: "Austin", region: "TX" },
        booking_items: [{ name: "Full interior detail", sort_order: 0 }],
    };

    beforeEach(() => {
        admin = createSupabaseMock();
        admin.respond("bookings.select", { data: booking });
        sendEmail.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it("sends due emails and records them as sent", async () => {
        admin.rpc.mockResolvedValueOnce({ data: [row("booking.confirmed")], error: null });
        sendEmail.mockResolvedValueOnce({ ok: true, provider: "resend", id: "re_1" });

        expect(await processNotifications(admin.client as never)).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "pat@example.com", idempotencyKey: "notification:n-booking.confirmed" }));
        expect(admin.callsTo("notifications", "update")[0].values).toMatchObject({ status: "sent", provider: "resend", provider_message_id: "re_1" });
    });

    it("cancels emails that no longer apply instead of sending them", async () => {
        admin.rpc.mockResolvedValueOnce({ data: [row("booking.deposit_reminder")], error: null });
        expect(await processNotifications(admin.client as never)).toMatchObject({ skipped: 1, sent: 0 });
        expect(sendEmail).not.toHaveBeenCalled();
        expect(admin.callsTo("notifications", "update")[0].values).toEqual({ status: "canceled", error: "deposit already resolved" });
    });

    it("retries failures with backoff, then gives up", async () => {
        admin.rpc.mockResolvedValueOnce({ data: [row("booking.confirmed", { attempts: 2 }), row("owner.new_booking", { attempts: 5 })], error: null });
        sendEmail.mockResolvedValue({ ok: false, provider: "resend", error: "rate_limited" });

        await processNotifications(admin.client as never);
        const [retry, giveUp] = admin.callsTo("notifications", "update").map((call) => call.values as Record<string, unknown>);
        expect(retry).toMatchObject({ error: "rate_limited" });
        expect(retry.scheduled_for).toBeTruthy();
        expect(giveUp).toEqual({ status: "failed", error: "rate_limited" });
    });
});
