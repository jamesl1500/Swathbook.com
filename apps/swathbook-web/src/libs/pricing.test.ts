import { describe, expect, it } from "vitest";
import { lineDepositCents, lineMinutes, linePriceCents, quoteBooking, type PricedService } from "./pricing";

const MOW: PricedService = {
    id: "mow",
    name: "Mowing",
    price_type: "starting_at",
    price_cents: 4_000,
    duration_minutes: 30,
    price_per_1000_sqft_cents: 800,
    minutes_per_1000_sqft: 4,
    deposit_cents: 1_000,
    deposit_type: "percent",
    deposit_percent: 25,
};
const EDGE: PricedService = { id: "edge", name: "Edging", price_type: "fixed", price_cents: 2_000, duration_minutes: 20, deposit_cents: 0 };

describe("measured prices (mirrors private.service_line_*)", () => {
    it("never goes under the service's own price and length", () => {
        expect(linePriceCents(MOW, 1_000)).toBe(4_000);
        expect(lineMinutes(MOW, 1_000)).toBe(30);
    });

    it("scales with area, rounding minutes up to 5", () => {
        expect(linePriceCents(MOW, 12_345)).toBe(9_876);
        // 12,345 × 4 / 1000 = 49.4 → 50
        expect(lineMinutes(MOW, 12_345)).toBe(50);
    });

    it("uses the plain price without an area or a rate", () => {
        expect(linePriceCents(MOW, null)).toBe(4_000);
        expect(linePriceCents(EDGE, 50_000)).toBe(2_000);
        expect(lineMinutes(EDGE, 50_000)).toBe(20);
    });

    it("caps at the database's limits", () => {
        expect(linePriceCents({ ...MOW, price_per_1000_sqft_cents: 1_000_000 }, 1_000_000)).toBe(10_000_000);
        expect(lineMinutes({ ...MOW, minutes_per_1000_sqft: 600 }, 1_000_000)).toBe(1_440);
    });

    it("grows a percent deposit with the price, and caps a flat one at it", () => {
        expect(lineDepositCents(MOW, 9_876)).toBe(2_469);
        expect(lineDepositCents({ ...EDGE, deposit_cents: undefined, deposit_type: "fixed", deposit_amount_cents: 5_000 }, 2_000)).toBe(2_000);
        // At the service's own price, the server's figure wins.
        expect(lineDepositCents(MOW, 4_000)).toBe(1_000);
    });
});

describe("quoteBooking", () => {
    it("adds up lines, minutes and deposits", () => {
        const quote = quoteBooking([MOW, EDGE], { areaSqft: 10_000 });
        expect(quote).toMatchObject({ subtotalCents: 10_000, discountCents: 0, totalCents: 10_000, minutes: 60, depositCents: 2_000 });
        expect(quote.lines.map((line) => line.isMinimum)).toEqual([false, false]);
    });

    it("marks a measured service as a starting price until it's measured", () => {
        expect(quoteBooking([MOW]).lines[0]).toMatchObject({ priceCents: 4_000, isMinimum: true });
    });

    it("takes the neighbor discount off the total and the deposit", () => {
        const quote = quoteBooking([MOW], { areaSqft: 10_000, neighborPercent: 10 });
        expect(quote).toMatchObject({ subtotalCents: 8_000, discountCents: 800, totalCents: 7_200, depositCents: 1_800 });
    });

    it("drops deposits when the business doesn't take payments", () => {
        expect(quoteBooking([MOW], { areaSqft: 10_000, acceptsPayments: false }).depositCents).toBe(0);
    });
});
