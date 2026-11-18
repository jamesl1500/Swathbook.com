/**
 * weather.ts
 *
 * Daily forecasts from Google's Weather API (same key as Maps), for spotting
 * rain days. Answers are cached for half an hour ('use cache'): forecasts
 * don't change faster than that, and the dashboard asks on every page view.
 * A refusal is only kept for a minute, so turning the API on shows up quickly.
 *
 * Without a key, or when Google refuses, there's simply no forecast: the
 * rain-day planner still works by hand.
 *
 * @module src/libs/google/weather
 * @since 1.0.0
 */

import { cacheLife } from "next/cache";
import type { LatLng } from "@/libs/measure/geo";
import { googleRequest, hasGoogleMaps } from "./maps";
import type { MapsProblem } from "./problems";


export type ForecastDay = {
    /** Local date at the location, YYYY-MM-DD. */
    date: string;
    /** Daytime chance of rain (or other precipitation), 0-100. */
    rainChance: number;
    /** Expected daytime rain in inches, when Google says. */
    rainInches: number | null;
    /** "Thunderstorms", "Partly sunny"… */
    summary: string | null;
    /** Google's icon, as a full SVG URL. */
    iconUrl: string | null;
    highF: number | null;
    lowF: number | null;
};

type Temperature = { degrees?: number; unit?: string };
type DayResponse = {
    displayDate?: { year: number; month: number; day: number };
    daytimeForecast?: {
        weatherCondition?: { iconBaseUri?: string; description?: { text?: string } };
        precipitation?: { probability?: { percent?: number }; qpf?: { quantity?: number; unit?: string } };
    };
    maxTemperature?: Temperature;
    minTemperature?: Temperature;
};

function fahrenheit(temperature: Temperature | undefined) {
    if (temperature?.degrees == null) return null;
    return Math.round(temperature.unit === "FAHRENHEIT" ? temperature.degrees : (temperature.degrees * 9) / 5 + 32);
}

function inches(qpf: { quantity?: number; unit?: string } | undefined) {
    if (qpf?.quantity == null) return null;
    const value = qpf.unit === "INCHES" ? qpf.quantity : qpf.quantity / 25.4;
    return Math.round(value * 100) / 100;
}

/** Turns one of Google's forecast days into ours (exported for tests). */
export function toForecastDay(day: DayResponse): ForecastDay | null {
    const date = day.displayDate;
    if (!date) return null;
    const daytime = day.daytimeForecast;
    const icon = daytime?.weatherCondition?.iconBaseUri;
    return {
        date: `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`,
        rainChance: Math.max(0, Math.min(100, Math.round(daytime?.precipitation?.probability?.percent ?? 0))),
        rainInches: inches(daytime?.precipitation?.qpf),
        summary: daytime?.weatherCondition?.description?.text ?? null,
        iconUrl: icon ? `${icon}.svg` : null,
        highF: fahrenheit(day.maxTemperature),
        lowF: fahrenheit(day.minTemperature),
    };
}

/** Up to `days` (max 10) days of forecast at `point`, starting today. */
export async function dailyForecast(point: LatLng, days = 7): Promise<{ days: ForecastDay[]; problem: MapsProblem | null }> {
    "use cache";
    if (!hasGoogleMaps()) {
        cacheLife("minutes");
        return { days: [], problem: null };
    }
    const count = Math.max(1, Math.min(10, Math.round(days)));
    const params = new URLSearchParams({
        "location.latitude": point.lat.toFixed(4),
        "location.longitude": point.lng.toFixed(4),
        days: String(count),
        pageSize: String(count),
    });
    const { data, problem } = await googleRequest<{ forecastDays?: DayResponse[] }>(
        `https://weather.googleapis.com/v1/forecast/days:lookup?${params.toString()}`,
        { api: "Weather API", method: "GET" },
    );
    cacheLife(problem ? { stale: 60, revalidate: 60, expire: 120 } : { stale: 300, revalidate: 30 * 60, expire: 60 * 60 });
    return {
        days: (data?.forecastDays ?? []).map(toForecastDay).filter((day): day is ForecastDay => day !== null),
        problem,
    };
}
