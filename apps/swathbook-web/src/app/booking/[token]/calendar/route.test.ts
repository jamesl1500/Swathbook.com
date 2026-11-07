// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ booking: null as Record<string, unknown> | null }));
vi.mock("@/libs/customer-booking", () => ({ loadCustomerBooking: vi.fn(async () => state.booking) }));

import { GET } from "./route";

const TOKEN = "ab".repeat(32);
const call = () => GET(new Request(`https://swathbook.test/booking/${TOKEN}/calendar`), { params: Promise.resolve({ token: TOKEN }) } as never);

beforeEach(() => {
    state.booking = {
        id: "bk1",
        reference: "SB-1042",
        scheduled_start: "2026-11-10T15:30:00.000Z",
        scheduled_end: "2026-11-10T16:45:00.000Z",
        businesses: { name: "Green Acres, LLC" },
        booking_items: [{ name: "Mow; front & back" }, { name: "Edge" }],
        customer_addresses: { line1: "1 Main St", line2: null, city: "Austin", region: "TX", postal_code: "78701" },
    };
});

describe("GET /booking/[token]/calendar", () => {
    it("returns a single-event .ics download that isn't cached", async () => {
        const response = await call();
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
        expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="booking-SB-1042.ics"');
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");

        const lines = (await response.text()).split("\r\n");
        expect(lines[0]).toBe("BEGIN:VCALENDAR");
        expect(lines.at(-1)).toBe("END:VCALENDAR");
        expect(lines).toContain("UID:bk1@swathbook.com");
        expect(lines).toContain("DTSTART:20261110T153000Z");
        expect(lines).toContain("DTEND:20261110T164500Z");
        expect(lines).toContain("DESCRIPTION:Booking SB-1042");
    });

    it("escapes commas, semicolons and newlines in text fields", async () => {
        state.booking = { ...state.booking!, customer_addresses: { line1: "1 Main St\nBack gate", city: "Austin" } };
        const body = await (await call()).text();
        expect(body).toContain("SUMMARY:Green Acres\\, LLC: Mow\\; front & back\\, Edge");
        expect(body).toContain("LOCATION:1 Main St\\nBack gate\\, Austin");
    });

    it("leaves out the location when there's no address", async () => {
        state.booking = { ...state.booking!, customer_addresses: null };
        expect(await (await call()).text()).not.toContain("LOCATION");
    });

    it("404s for unknown tokens", async () => {
        state.booking = null;
        expect((await call()).status).toBe(404);
    });
});
