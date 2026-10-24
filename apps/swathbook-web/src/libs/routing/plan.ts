/**
 * plan.ts
 *
 * Turns a crew member's jobs for one day into an optimized route and saves it.
 * Separated from the Server Action so it can be unit tested with fakes.
 *
 * Reads go through the caller's RLS client (so they only see their business).
 * The route itself is written with the service role, because clients can't set
 * optimizer output (totals, legs, optimized_at) directly; callers must have
 * already checked the user manages this business.
 *
 * @module src/libs/routing/plan
 * @since 1.0.0
 */

import { geocodeAddress, routePolyline, travelMatrix } from "@/libs/google/maps";
import type { createAdminClient } from "@/libs/supabase/admin";
import type { createClient } from "@/libs/supabase/server";
import { addDays, dayRangeUtc, minutesIntoDay, zonedToUtc } from "@/libs/time";
import { bookingOrder, evaluateOrder, optimizeRoute, type LatLng, type RoutePlan, type RouteStopInput } from "./optimizer";

type Client = Awaited<ReturnType<typeof createClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

export type PlanResult =
    | { ok: true; routeId: string; stopCount: number; excluded: string[]; savedSeconds: number; source: "google" | "estimate" }
    | { ok: false; error: string };

export type RoutingBusiness = {
    id: string;
    timezone: string;
    base_address: string | null;
    base_lat: number | null;
    base_lng: number | null;
    arrival_window_minutes: number;
};

type LocatedStop = { id: string; scheduledStart: string; scheduledEnd: string; point: LatLng };

export function minutesToTimeKey(minutes: number) {
    const clamped = Math.max(0, Math.min(Math.round(minutes), 24 * 60 - 1));
    return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function loadDayJobs(db: Client, business: RoutingBusiness, memberId: string, date: string) {
    const { start, end } = dayRangeUtc(date, addDays(date, 1), business.timezone);
    return db
        .from("bookings")
        .select("id, scheduled_start, scheduled_end, customers(full_name), customer_addresses(id, line1, city, region, postal_code, lat, lng)")
        .eq("business_id", business.id)
        .eq("assigned_member_id", memberId)
        .in("status", ["confirmed", "in_progress"])
        .gte("scheduled_start", start.toISOString())
        .lt("scheduled_start", end.toISOString())
        .order("scheduled_start");
}

type DayJob = NonNullable<Awaited<ReturnType<typeof loadDayJobs>>["data"]>[number];

/** The business's starting point, geocoded once and remembered. */
async function resolveBase(db: Client, business: RoutingBusiness): Promise<LatLng | null> {
    if (business.base_lat != null && business.base_lng != null) return { lat: business.base_lat, lng: business.base_lng };
    if (!business.base_address) return null;
    const geocoded = await geocodeAddress(business.base_address);
    if (!geocoded) return null;
    await db.from("businesses").update({ base_lat: geocoded.lat, base_lng: geocoded.lng }).eq("id", business.id);
    return { lat: geocoded.lat, lng: geocoded.lng };
}

/** Coordinates for one job's address, geocoding (and saving) it if needed. */
async function locate(db: Client, job: DayJob): Promise<LatLng | null> {
    const address = job.customer_addresses;
    if (!address) return null;
    if (address.lat != null && address.lng != null) return { lat: address.lat, lng: address.lng };
    const geocoded = await geocodeAddress([address.line1, address.city, address.region, address.postal_code].filter(Boolean).join(", "));
    if (!geocoded) return null;
    await db.from("customer_addresses").update({ lat: geocoded.lat, lng: geocoded.lng, google_place_id: geocoded.placeId }).eq("id", address.id);
    return { lat: geocoded.lat, lng: geocoded.lng };
}

async function locateStops(db: Client, jobs: DayJob[]) {
    const points = await Promise.all(jobs.map((job) => locate(db, job)));
    const located: LocatedStop[] = [];
    const excluded: string[] = [];
    jobs.forEach((job, index) => {
        const point = points[index];
        if (point) located.push({ id: job.id, scheduledStart: job.scheduled_start, scheduledEnd: job.scheduled_end, point });
        else excluded.push(job.customers?.full_name ?? "A job");
    });
    return { located, excluded };
}

function toStopInputs(located: LocatedStop[], timeZone: string, arrivalWindow: number): RouteStopInput[] {
    return located.map((stop) => {
        const scheduled = minutesIntoDay(new Date(stop.scheduledStart), timeZone);
        const duration = Math.round((new Date(stop.scheduledEnd).getTime() - new Date(stop.scheduledStart).getTime()) / 60_000);
        return { id: stop.id, windowStart: scheduled - arrivalWindow, windowEnd: scheduled + arrivalWindow, serviceMinutes: duration };
    });
}

async function saveRoute(
    admin: AdminClient,
    business: RoutingBusiness,
    { memberId, date, depot, plan, baseline, source, polyline, excluded }: {
        memberId: string;
        date: string;
        depot: LatLng;
        plan: RoutePlan;
        baseline: RoutePlan;
        source: "google" | "estimate";
        polyline: string | null;
        excluded: string[];
    },
) {
    const { data: route } = await admin
        .from("routes")
        .upsert(
            {
                business_id: business.id,
                member_id: memberId,
                route_date: date,
                status: "optimized",
                start_address: business.base_address,
                start_lat: depot.lat,
                start_lng: depot.lng,
                total_distance_meters: plan.totalMeters,
                total_duration_seconds: plan.totalDriveSeconds,
                baseline_distance_meters: baseline.totalMeters,
                baseline_duration_seconds: baseline.totalDriveSeconds,
                optimized_at: new Date().toISOString(),
                optimization_provider: source === "google" ? "google_routes" : "estimate",
                optimization_meta: { polyline, excluded, late_minutes: Math.round(plan.totalLateMinutes) },
            },
            { onConflict: "business_id,member_id,route_date" },
        )
        .select("id")
        .single();
    if (!route) return null;

    await admin.from("route_stops").delete().eq("route_id", route.id);
    // A job moved from another route (reassigned or rescheduled) leaves it.
    await admin.from("route_stops").delete().in("booking_id", plan.stops.map((stop) => stop.id));
    const { error } = await admin.from("route_stops").insert(
        plan.stops.map((stop) => ({
            business_id: business.id,
            route_id: route.id,
            booking_id: stop.id,
            sequence: stop.sequence,
            planned_arrival: zonedToUtc(date, minutesToTimeKey(stop.arrivalMinutes), business.timezone).toISOString(),
            planned_departure: zonedToUtc(date, minutesToTimeKey(stop.departureMinutes), business.timezone).toISOString(),
            travel_distance_meters: stop.legMeters,
            travel_duration_seconds: stop.legSeconds,
        })),
    );
    return error ? null : route.id;
}

export async function planDayRoute(
    { db, admin }: { db: Client; admin: AdminClient },
    business: RoutingBusiness,
    { memberId, date }: { memberId: string; date: string },
): Promise<PlanResult> {
    const { data: jobs, error } = await loadDayJobs(db, business, memberId, date);
    if (error) return { ok: false, error: "We couldn't load that day's jobs." };
    if (!jobs?.length) return { ok: false, error: "There are no confirmed jobs to route that day." };
    if (jobs.length > 24) return { ok: false, error: "Routes can hold up to 24 stops. Split the day across crew members." };

    const [base, { located, excluded }] = await Promise.all([resolveBase(db, business), locateStops(db, jobs)]);
    if (!located.length) return { ok: false, error: "None of that day's jobs have an address we can map." };

    const depot = base ?? located[0].point;
    const { matrix, source } = await travelMatrix([depot, ...located.map((stop) => stop.point)]);
    const stops = toStopInputs(located, business.timezone, business.arrival_window_minutes);
    const options = { returnToStart: Boolean(base) };
    const plan = optimizeRoute(stops, matrix, options);
    const baseline = evaluateOrder(bookingOrder(stops), stops, matrix, options);
    const ordered = plan.order.map((index) => located[index].point);
    const polyline = await routePolyline(base ? [base, ...ordered, base] : ordered);

    const routeId = await saveRoute(admin, business, { memberId, date, depot, plan, baseline, source, polyline, excluded });
    if (!routeId) return { ok: false, error: "We couldn't save the route." };

    return {
        ok: true,
        routeId,
        stopCount: plan.stops.length,
        excluded,
        savedSeconds: Math.max(0, baseline.totalDriveSeconds - plan.totalDriveSeconds),
        source,
    };
}
