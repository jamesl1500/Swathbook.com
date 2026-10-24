import { describe, expect, it } from "vitest";
import {
    bookingOrder,
    estimateMatrix,
    evaluateOrder,
    haversineMeters,
    optimizeRoute,
    type RouteStopInput,
    type TravelMatrix,
} from "./optimizer";

/** Matrix from points on a straight east-west road, 1 km apart = 60 s per km. */
function lineMatrix(positionsKm: number[]): TravelMatrix {
    const points = [0, ...positionsKm];
    const distances = points.map((a) => points.map((b) => Math.abs(a - b) * 1000));
    const durations = distances.map((row) => row.map((meters) => (meters / 1000) * 60));
    return { durations, distances };
}

/** Wide-open windows: any order is on time. */
function flexibleStops(count: number): RouteStopInput[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `s${index}`,
        windowStart: 8 * 60,
        windowEnd: 17 * 60,
        serviceMinutes: 30,
    }));
}

describe("haversineMeters", () => {
    it("matches a known distance (Austin to Dallas ≈ 293 km)", () => {
        const km = haversineMeters({ lat: 30.2672, lng: -97.7431 }, { lat: 32.7767, lng: -96.797 }) / 1000;
        expect(km).toBeGreaterThan(285);
        expect(km).toBeLessThan(300);
    });

    it("is zero for the same point", () => {
        expect(haversineMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
    });
});

describe("estimateMatrix", () => {
    it("adds a road detour and converts to drive time", () => {
        const matrix = estimateMatrix([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }]);
        // 0.1° of longitude at the equator ≈ 11.1 km; ×1.3 ≈ 14.5 km; at 40 km/h ≈ 21.7 min.
        expect(matrix.distances[0][1]).toBeGreaterThan(14_000);
        expect(matrix.distances[0][1]).toBeLessThan(15_000);
        expect(matrix.durations[0][1] / 60).toBeCloseTo(21.7, 0);
        expect(matrix.durations[1][1]).toBe(0);
    });
});

describe("evaluateOrder", () => {
    it("leaves just in time for the first stop and accumulates drive, service and waits", () => {
        const stops: RouteStopInput[] = [
            { id: "a", windowStart: 540, windowEnd: 600, serviceMinutes: 30 }, // 9:00–10:00
            { id: "b", windowStart: 660, windowEnd: 720, serviceMinutes: 30 }, // 11:00–12:00
        ];
        const plan = evaluateOrder([0, 1], stops, lineMatrix([5, 10]));

        expect(plan.departMinutes).toBe(540 - 5); // 5 km = 5 min to the first stop
        expect(plan.stops[0]).toMatchObject({ arrivalMinutes: 540, departureMinutes: 570, waitMinutes: 0, lateMinutes: 0 });
        // Leaves 'a' at 9:30, 5 min drive, waits until b opens at 11:00.
        expect(plan.stops[1]).toMatchObject({ arrivalMinutes: 660, waitMinutes: 660 - 575, lateMinutes: 0 });
        expect(plan.totalMeters).toBe(10_000);
    });

    it("counts lateness and the drive home when asked", () => {
        const stops: RouteStopInput[] = [
            { id: "a", windowStart: 540, windowEnd: 545, serviceMinutes: 60 },
            { id: "b", windowStart: 540, windowEnd: 545, serviceMinutes: 30 },
        ];
        const plan = evaluateOrder([0, 1], stops, lineMatrix([1, 2]), { returnToStart: true });
        expect(plan.stops[1].lateMinutes).toBeGreaterThan(0);
        expect(plan.totalMeters).toBe(1000 + 1000 + 2000);
    });
});

describe("optimizeRoute", () => {
    it("drives a line of stops in order instead of zig-zagging", () => {
        // Booked in a zig-zag: 8 km, 2 km, 6 km, 4 km out of town.
        const stops = flexibleStops(4);
        const matrix = lineMatrix([8, 2, 6, 4]);
        const plan = optimizeRoute(stops, matrix);

        expect(plan.order.map((index) => [8, 2, 6, 4][index])).toEqual([2, 4, 6, 8]);
        expect(plan.totalMeters).toBe(8000);
        expect(plan.totalLateMinutes).toBe(0);
        expect(plan.totalMeters).toBeLessThan(evaluateOrder(bookingOrder(stops), stops, matrix).totalMeters);
    });

    it("never makes things worse than the booked order", () => {
        const stops = flexibleStops(6);
        const matrix = estimateMatrix([
            { lat: 30.27, lng: -97.74 },
            { lat: 30.31, lng: -97.7 },
            { lat: 30.2, lng: -97.8 },
            { lat: 30.35, lng: -97.75 },
            { lat: 30.25, lng: -97.69 },
            { lat: 30.29, lng: -97.83 },
            { lat: 30.22, lng: -97.72 },
        ]);
        const booked = evaluateOrder(bookingOrder(stops), stops, matrix);
        expect(optimizeRoute(stops, matrix).cost).toBeLessThanOrEqual(booked.cost);
    });

    it("keeps a tight morning appointment first even when it's farther away", () => {
        const stops: RouteStopInput[] = [
            { id: "near-afternoon", windowStart: 13 * 60, windowEnd: 15 * 60, serviceMinutes: 60 },
            { id: "far-morning", windowStart: 8 * 60, windowEnd: 8 * 60 + 30, serviceMinutes: 60 },
        ];
        const plan = optimizeRoute(stops, lineMatrix([1, 20]));
        expect(plan.stops.map((stop) => stop.id)).toEqual(["far-morning", "near-afternoon"]);
        expect(plan.totalLateMinutes).toBe(0);
    });

    it("returns sequences starting at 1 and is deterministic", () => {
        const stops = flexibleStops(5);
        const matrix = lineMatrix([3, 1, 4, 1, 5]);
        const first = optimizeRoute(stops, matrix);
        const second = optimizeRoute(stops, matrix);
        expect(first.stops.map((stop) => stop.sequence)).toEqual([1, 2, 3, 4, 5]);
        expect(second.order).toEqual(first.order);
    });

    it("handles an empty day and a single stop", () => {
        expect(optimizeRoute([], lineMatrix([])).stops).toEqual([]);
        expect(optimizeRoute(flexibleStops(1), lineMatrix([3])).order).toEqual([0]);
    });
});
