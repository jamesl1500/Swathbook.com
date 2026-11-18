import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

import { dailyForecast, toForecastDay } from "./weather";

const DAY = {
    displayDate: { year: 2026, month: 11, day: 3 },
    daytimeForecast: {
        weatherCondition: { iconBaseUri: "https://maps.gstatic.com/weather/v1/rain", description: { text: "Rain showers" } },
        precipitation: { probability: { percent: 82.4, type: "RAIN" }, qpf: { quantity: 12.7, unit: "MILLIMETERS" } },
    },
    maxTemperature: { degrees: 20, unit: "CELSIUS" },
    minTemperature: { degrees: 10, unit: "CELSIUS" },
};

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("toForecastDay", () => {
    it("reads Google's day into ours, in inches and Fahrenheit", () => {
        expect(toForecastDay(DAY)).toEqual({
            date: "2026-11-03",
            rainChance: 82,
            rainInches: 0.5,
            summary: "Rain showers",
            iconUrl: "https://maps.gstatic.com/weather/v1/rain.svg",
            highF: 68,
            lowF: 50,
        });
    });

    it("treats a missing chance as dry and skips days without a date", () => {
        expect(toForecastDay({ displayDate: { year: 2026, month: 1, day: 9 } })).toMatchObject({ date: "2026-01-09", rainChance: 0, rainInches: null, highF: null });
        expect(toForecastDay({})).toBeNull();
    });
});

describe("dailyForecast", () => {
    it("asks for the days at the point and reads them", async () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "maps-key");
        const fetch = vi.fn(async () => new Response(JSON.stringify({ forecastDays: [DAY] }), { status: 200 }));
        vi.stubGlobal("fetch", fetch);

        const result = await dailyForecast({ lat: 30.2672, lng: -97.7431 }, 7);
        expect(result).toMatchObject({ problem: null, days: [{ date: "2026-11-03", rainChance: 82 }] });
        const url = new URL((fetch.mock.calls[0] as unknown as [string])[0]);
        expect(url.pathname).toBe("/v1/forecast/days:lookup");
        expect(url.searchParams.get("days")).toBe("7");
        expect(url.searchParams.get("location.latitude")).toBe("30.2672");
    });

    it("says why when Google refuses, and has no days", async () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "maps-key");
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "Permission denied on the service." } }), { status: 403 })));
        expect(await dailyForecast({ lat: 30, lng: -97 })).toMatchObject({ days: [], problem: { api: "Weather API", reason: "denied" } });
    });

    it("has nothing to say without a key", async () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
        expect(await dailyForecast({ lat: 30, lng: -97 })).toEqual({ days: [], problem: null });
    });
});
