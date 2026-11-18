/**
 * rain.ts
 *
 * Rain days: the week's forecast at the business's base, next to the jobs
 * rain would stop (those with a weather-dependent service). Feeds the
 * dashboard's rain warning and the rain-day planner, which moves a day's jobs
 * through plan_rain_delay().
 *
 * @module src/libs/rain
 * @since 1.0.0
 */

import { dailyForecast, type ForecastDay } from "./google/weather";
import type { createClient } from "./supabase/server";
import { addDays, dayRangeUtc, toDateKey, todayKey, weekdayOf } from "./time";

type Client = Awaited<ReturnType<typeof createClient>>;

export type RainBusiness = {
    id: string;
    timezone: string;
    base_lat: number | null;
    base_lng: number | null;
    rain_alerts_enabled: boolean;
    rain_alert_percent: number;
    booking_window_days: number;
};

export type OutlookDay = {
    date: string;
    forecast: ForecastDay | null;
    /** Live jobs that day. */
    jobs: number;
    /** Of those, the ones rain would stop. */
    atRisk: number;
    /** Chance of rain at or over the business's threshold. */
    rainy: boolean;
};

export type RainOutlook = { days: OutlookDay[]; hasForecast: boolean; threshold: number };

type JobRow = {
    scheduled_start: string;
    booking_items: Array<{ service_id: string | null; services: { weather_dependent: boolean } | null }>;
};

/** Rain stops a job with no items, or any item whose service is weather-dependent (or since deleted). */
export function rainStops(job: Pick<JobRow, "booking_items">) {
    return job.booking_items.length === 0 || job.booking_items.some((item) => item.services?.weather_dependent ?? true);
}

/** Lays jobs and forecast side by side, one entry per day from `from`. */
export function buildOutlook(
    { from, days, timeZone, threshold }: { from: string; days: number; timeZone: string; threshold: number },
    forecast: ForecastDay[],
    jobs: JobRow[],
): OutlookDay[] {
    return Array.from({ length: days }, (_, index) => {
        const date = addDays(from, index);
        const onDay = jobs.filter((job) => toDateKey(new Date(job.scheduled_start), timeZone) === date);
        const day = forecast.find((entry) => entry.date === date) ?? null;
        return {
            date,
            forecast: day,
            jobs: onDay.length,
            atRisk: onDay.filter(rainStops).length,
            rainy: day ? day.rainChance >= threshold : false,
        };
    });
}

/** The week ahead, or null when rain alerts are off or there's no base to forecast for. */
/** Days of forecast fetched for every outlook (callers use the first few). */
const FORECAST_DAYS = 7;

export async function loadRainOutlook(
    supabase: Client,
    business: RainBusiness,
    days = 7,
    /** Skip loading jobs when no day reaches the threshold (the banner only cares about wet days). */
    { onlyIfRainy = false }: { onlyIfRainy?: boolean } = {},
): Promise<RainOutlook | null> {
    const from = todayKey(business.timezone);
    const { start, end } = dayRangeUtc(from, addDays(from, days), business.timezone);
    const point = business.base_lat != null && business.base_lng != null ? { lat: business.base_lat, lng: business.base_lng } : null;
    // Always the same window, so the banner and the planner share one cached (and billed) forecast.
    const loadForecast = async () => {
        if (!point) return { days: [] as ForecastDay[], problem: null };
        const forecast = await dailyForecast(point, FORECAST_DAYS);
        return { ...forecast, days: forecast.days.slice(0, days) };
    };
    const loadJobs = () =>
        supabase
            .from("bookings")
            .select("scheduled_start, booking_items(service_id, services(weather_dependent))")
            .eq("business_id", business.id)
            .in("status", ["requested", "confirmed"])
            .gte("scheduled_start", start.toISOString())
            .lt("scheduled_start", end.toISOString());

    let forecast: Awaited<ReturnType<typeof loadForecast>>;
    let jobs: JobRow[] | null;
    if (onlyIfRainy) {
        // The forecast is cached, so checking it first saves a query on dry days.
        forecast = await loadForecast();
        if (!forecast.days.some((day) => day.rainChance >= business.rain_alert_percent)) return null;
        jobs = ((await loadJobs()).data ?? null) as JobRow[] | null;
    } else {
        const [loaded, { data }] = await Promise.all([loadForecast(), loadJobs()]);
        forecast = loaded;
        jobs = (data ?? null) as JobRow[] | null;
    }

    return {
        days: buildOutlook({ from, days, timeZone: business.timezone, threshold: business.rain_alert_percent }, forecast.days, (jobs ?? []) as JobRow[]),
        hasForecast: forecast.days.length > 0,
        threshold: business.rain_alert_percent,
    };
}

/** The soonest rainy day (in the next `withinDays`) that has jobs rain would stop. */
export function nextRainDay(outlook: RainOutlook | null, withinDays = 3) {
    return outlook?.days.slice(0, withinDays).find((day) => day.rainy && day.atRisk > 0) ?? null;
}

/**
 * Where to move a rainy day's jobs by default: the first later day that's
 * open, inside the booking window, and not rainy itself.
 */
export function suggestMoveTo(
    rainDate: string,
    { openWeekdays, outlook, lastDay }: { openWeekdays: number[]; outlook: OutlookDay[]; lastDay: string },
) {
    for (let offset = 1; offset <= 14; offset++) {
        const date = addDays(rainDate, offset);
        if (date > lastDay) break;
        if (!openWeekdays.includes(weekdayOf(date))) continue;
        if (outlook.find((day) => day.date === date)?.rainy) continue;
        return date;
    }
    return null;
}
