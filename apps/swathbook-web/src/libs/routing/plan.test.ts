// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import type { TravelMatrix } from "./optimizer";

const maps = vi.hoisted(() => ({ geocodeAddress: vi.fn(), routePolyline: vi.fn(), travelMatrix: vi.fn() }));
vi.mock("@/libs/google/maps", () => maps);

import { minutesToTimeKey, planDayRoute, type RoutingBusiness } from "./plan";

const BUSINESS: RoutingBusiness = {
    id: "biz",
    timezone: "America/Chicago",
    base_address: "100 Depot Rd, Austin, TX",
    base_lat: 30.0,
    base_lng: -97.0,
    arrival_window_minutes: 60,
};

/** A job at `hour` local time (CST) for an hour, at the given point. */
function job(id: string, hour: number, point: { lat: number; lng: number } | null, name = id) {
    const start = new Date(Date.UTC(2026, 10, 10, hour + 6));
    return {
        id,
        scheduled_start: start.toISOString(),
        scheduled_end: new Date(start.getTime() + 3_600_000).toISOString(),
        customers: { full_name: name },
        customer_addresses: point ? { id: `addr-${id}`, line1: `${id} St`, city: "Austin", region: "TX", postal_code: null, ...point } : null,
    };
}

/** Straight-line-ish seconds between points (10 min per 0.1 degree). */
function matrixFor(points: Array<{ lat: number; lng: number }>): TravelMatrix {
    const durations = points.map((a) => points.map((b) => Math.round((Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng)) * 6_000)));
    return { durations, distances: durations.map((row) => row.map((seconds) => seconds * 15)) };
}

let db: SupabaseMock;
let admin: SupabaseMock;

beforeEach(() => {
    db = createSupabaseMock();
    admin = createSupabaseMock();
    admin.respond("routes.upsert", { data: { id: "route-1" } });
    maps.geocodeAddress.mockReset().mockResolvedValue(null);
    maps.routePolyline.mockReset().mockResolvedValue("encoded-polyline");
    maps.travelMatrix.mockReset().mockImplementation(async (points) => ({ matrix: matrixFor(points), source: "google" }));
});

const plan = (business = BUSINESS) => planDayRoute({ db: db.client as never, admin: admin.client as never }, business, { memberId: "m1", date: "2026-11-10" });

describe("minutesToTimeKey", () => {
    it("formats and clamps to the day", () => {
        expect(minutesToTimeKey(0)).toBe("00:00");
        expect(minutesToTimeKey(9 * 60 + 5.4)).toBe("09:05");
        expect(minutesToTimeKey(-30)).toBe("00:00");
        expect(minutesToTimeKey(26 * 60)).toBe("23:59");
    });
});

describe("planDayRoute", () => {
    it("loads only this member's confirmed jobs for the local day", async () => {
        await plan();
        const { filters } = db.callsTo("bookings", "select")[0];
        expect(filters).toEqual(
            expect.arrayContaining([
                ["eq", "business_id", "biz"],
                ["eq", "assigned_member_id", "m1"],
                ["in", "status", ["confirmed", "in_progress"]],
                // Midnight to midnight in Chicago.
                ["gte", "scheduled_start", "2026-11-10T06:00:00.000Z"],
                ["lt", "scheduled_start", "2026-11-11T06:00:00.000Z"],
            ]),
        );
    });

    it("explains empty and oversized days", async () => {
        expect(await plan()).toEqual({ ok: false, error: "There are no confirmed jobs to route that day." });

        db.respond("bookings.select", { data: Array.from({ length: 25 }, (_, i) => job(`j${i}`, 8, { lat: 30, lng: -97 })) });
        expect((await plan()).ok).toBe(false);

        db = createSupabaseMock();
        db.respond("bookings.select", { error: { message: "boom" } });
        expect(await plan()).toEqual({ ok: false, error: "We couldn't load that day's jobs." });
    });

    it("plans from the depot, saves the stops in order, and reports time saved", async () => {
        // Booked far-near-far: driving near first saves time.
        db.respond("bookings.select", {
            data: [job("far", 9, { lat: 30.5, lng: -97.0 }), job("near", 10, { lat: 30.1, lng: -97.0 }), job("mid", 11, { lat: 30.3, lng: -97.0 })],
        });
        const result = await plan();

        expect(result).toMatchObject({ ok: true, routeId: "route-1", stopCount: 3, excluded: [], source: "google" });
        const route = admin.callsTo("routes", "upsert")[0].values as Record<string, number & Record<string, unknown>>;
        // Time saved is the booked order's driving minus the optimized order's, never negative.
        expect(route.total_duration_seconds).toBeLessThanOrEqual(route.baseline_duration_seconds);
        expect(result.ok && result.savedSeconds).toBe(route.baseline_duration_seconds - route.total_duration_seconds);
        expect(route).toMatchObject({
            business_id: "biz",
            member_id: "m1",
            route_date: "2026-11-10",
            status: "optimized",
            start_lat: 30,
            start_lng: -97,
            optimization_provider: "google_routes",
        });
        expect(route.optimization_meta).toMatchObject({ polyline: "encoded-polyline", excluded: [] });

        // Old stops are cleared (for this route and for jobs moving in from another one) before inserting.
        const deletes = admin.callsTo("route_stops", "delete");
        expect(deletes[0].filters).toEqual([["eq", "route_id", "route-1"]]);
        expect(deletes[1].filters[0][0]).toBe("in");

        const stops = admin.callsTo("route_stops", "insert")[0].values as Array<{ booking_id: string; sequence: number; planned_arrival: string }>;
        expect(stops).toHaveLength(3);
        expect(stops.map((stop) => stop.sequence)).toEqual([...stops.map((s) => s.sequence)].sort((a, b) => a - b));
        expect(new Set(stops.map((stop) => stop.booking_id))).toEqual(new Set(["far", "near", "mid"]));
        for (const stop of stops) expect(stop.planned_arrival).toMatch(/^2026-11-10T/);

        // The polyline loops back to the depot.
        const polylinePoints = maps.routePolyline.mock.calls[0][0];
        expect(polylinePoints[0]).toEqual({ lat: 30, lng: -97 });
        expect(polylinePoints.at(-1)).toEqual({ lat: 30, lng: -97 });
    });

    it("geocodes and remembers missing coordinates, leaving off jobs it can't map", async () => {
        db.respond("bookings.select", {
            data: [job("known", 9, { lat: 30.2, lng: -97.0 }), { ...job("unknown", 10, null, "Ada Lovelace") }, job("lookup", 11, { lat: null as never, lng: null as never })],
        });
        maps.geocodeAddress.mockImplementation(async (address: string) => (address.startsWith("lookup") ? { lat: 30.4, lng: -97.1, placeId: "pl_1", formatted: address } : null));

        const result = await plan();
        expect(result).toMatchObject({ ok: true, stopCount: 2, excluded: ["Ada Lovelace"] });
        expect(maps.geocodeAddress).toHaveBeenCalledWith("lookup St, Austin, TX");
        expect(db.callsTo("customer_addresses", "update")[0]).toMatchObject({
            values: { lat: 30.4, lng: -97.1, google_place_id: "pl_1" },
            filters: [["eq", "id", "addr-lookup"]],
        });
    });

    it("geocodes the depot once, and starts at the first job when there is none", async () => {
        db.respond("bookings.select", { data: [job("a", 9, { lat: 30.2, lng: -97.0 })] });
        maps.geocodeAddress.mockResolvedValue({ lat: 29.9, lng: -97.2, placeId: "pl_d", formatted: "" });
        await plan({ ...BUSINESS, base_lat: null, base_lng: null });
        expect(db.callsTo("businesses", "update")[0].values).toEqual({ base_lat: 29.9, base_lng: -97.2 });

        admin = createSupabaseMock();
        admin.respond("routes.upsert", { data: { id: "route-2" } });
        await plan({ ...BUSINESS, base_address: null, base_lat: null, base_lng: null });
        expect(admin.callsTo("routes", "upsert")[0].values).toMatchObject({ start_lat: 30.2, start_lng: -97.0 });
        // Without a depot the route doesn't loop back.
        expect(maps.routePolyline.mock.calls.at(-1)?.[0]).toEqual([{ lat: 30.2, lng: -97.0 }]);
    });

    it("fails when no job can be mapped or the route can't be saved", async () => {
        db.respond("bookings.select", { data: [job("x", 9, null)] });
        expect(await plan()).toEqual({ ok: false, error: "None of that day's jobs have an address we can map." });

        db = createSupabaseMock();
        db.respond("bookings.select", { data: [job("a", 9, { lat: 30.2, lng: -97.0 })] });
        admin = createSupabaseMock();
        expect(await plan()).toEqual({ ok: false, error: "We couldn't save the route." });
    });
});
