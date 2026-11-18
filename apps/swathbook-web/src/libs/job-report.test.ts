import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { tippingFor } from "./job-report";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const DONE = { status: "completed", completed_at: "2026-11-17T15:00:00Z", tips_enabled: true, accepts_payments: true };

describe("tippingFor", () => {
    it("suggests 15, 20 and 25% in whole dollars", () => {
        expect(tippingFor(DONE, 8_250, NOW)).toEqual({
            suggestions: [
                { label: "15%", cents: 1_200 },
                { label: "20%", cents: 1_700 },
                { label: "25%", cents: 2_100 },
            ],
            minCents: 100,
            maxCents: 10_000,
        });
    });

    it("suggests flat amounts when the job had no real price", () => {
        expect(tippingFor(DONE, 0, NOW)?.suggestions.map((suggestion) => suggestion.cents)).toEqual([500, 1_000, 2_000]);
    });

    it("lets a big job take a big tip", () => {
        expect(tippingFor(DONE, 45_000, NOW)?.maxCents).toBe(45_000);
    });

    it("only offers tips on finished jobs, with tips and payments on, within 30 days", () => {
        expect(tippingFor({ ...DONE, status: "confirmed" }, 5_000, NOW)).toBeNull();
        expect(tippingFor({ ...DONE, tips_enabled: false }, 5_000, NOW)).toBeNull();
        expect(tippingFor({ ...DONE, accepts_payments: false }, 5_000, NOW)).toBeNull();
        expect(tippingFor({ ...DONE, completed_at: "2026-10-01T15:00:00Z" }, 5_000, NOW)).toBeNull();
    });
});
