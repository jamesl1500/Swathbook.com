import { describe, expect, it, vi } from "vitest";

vi.mock("./google/weather", () => ({ dailyForecast: vi.fn() }));

import type { ForecastDay } from "./google/weather";
import { buildOutlook, nextRainDay, rainStops, suggestMoveTo } from "./rain";

function forecast(date: string, rainChance: number): ForecastDay {
    return { date, rainChance, rainInches: null, summary: null, iconUrl: null, highF: null, lowF: null };
}

const OUTDOOR = { services: { weather_dependent: true }, service_id: "s1" };
const INDOOR = { services: { weather_dependent: false }, service_id: "s2" };
// 10am Chicago on Nov 18 and 19, 2026.
const NOV_18 = "2026-11-18T16:00:00Z";
const NOV_19 = "2026-11-19T16:00:00Z";

describe("rainStops", () => {
    it("counts jobs with any weather-dependent service, or a deleted one, or none at all", () => {
        expect(rainStops({ booking_items: [OUTDOOR, INDOOR] })).toBe(true);
        expect(rainStops({ booking_items: [INDOOR] })).toBe(false);
        expect(rainStops({ booking_items: [{ service_id: null, services: null }] })).toBe(true);
        expect(rainStops({ booking_items: [] })).toBe(true);
    });
});

describe("buildOutlook", () => {
    it("lines up each day's forecast with its jobs", () => {
        const days = buildOutlook(
            { from: "2026-11-18", days: 3, timeZone: "America/Chicago", threshold: 60 },
            [forecast("2026-11-18", 80), forecast("2026-11-19", 20)],
            [
                { scheduled_start: NOV_18, booking_items: [OUTDOOR] },
                { scheduled_start: NOV_18, booking_items: [INDOOR] },
                { scheduled_start: NOV_19, booking_items: [OUTDOOR] },
            ],
        );
        expect(days.map(({ date, jobs, atRisk, rainy }) => ({ date, jobs, atRisk, rainy }))).toEqual([
            { date: "2026-11-18", jobs: 2, atRisk: 1, rainy: true },
            { date: "2026-11-19", jobs: 1, atRisk: 1, rainy: false },
            { date: "2026-11-20", jobs: 0, atRisk: 0, rainy: false },
        ]);
        expect(days[2].forecast).toBeNull();
    });
});

describe("nextRainDay", () => {
    const outlook = (days: Array<[string, boolean, number]>) => ({
        hasForecast: true,
        threshold: 60,
        days: days.map(([date, rainy, atRisk]) => ({ date, rainy, atRisk, jobs: atRisk, forecast: forecast(date, rainy ? 80 : 10) })),
    });

    it("finds the first wet day that has outdoor jobs", () => {
        expect(nextRainDay(outlook([["2026-11-18", true, 0], ["2026-11-19", true, 3]]))?.date).toBe("2026-11-19");
    });

    it("only looks a few days ahead", () => {
        expect(nextRainDay(outlook([["2026-11-18", false, 2], ["2026-11-19", false, 2], ["2026-11-20", false, 2], ["2026-11-21", true, 2]]))).toBeNull();
        expect(nextRainDay(null)).toBeNull();
    });
});

describe("suggestMoveTo", () => {
    const outlook = [
        { date: "2026-11-19", rainy: true },
        { date: "2026-11-20", rainy: false },
    ].map((day) => ({ ...day, forecast: null, jobs: 0, atRisk: 0 }));

    it("picks the next open, dry day", () => {
        // Nov 18 2026 is a Wednesday; open Mon–Fri. Thursday the 19th is rainy too.
        expect(suggestMoveTo("2026-11-18", { openWeekdays: [1, 2, 3, 4, 5], outlook, lastDay: "2026-12-31" })).toBe("2026-11-20");
    });

    it("skips closed days and stays inside the booking window", () => {
        expect(suggestMoveTo("2026-11-20", { openWeekdays: [1, 2, 3, 4, 5], outlook, lastDay: "2026-12-31" })).toBe("2026-11-23");
        expect(suggestMoveTo("2026-11-20", { openWeekdays: [1, 2, 3, 4, 5], outlook, lastDay: "2026-11-22" })).toBeNull();
    });
});
