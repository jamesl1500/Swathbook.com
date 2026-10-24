/**
 * optimizer.ts
 *
 * Plans the order of a crew member's stops for one day: a small vehicle-routing
 * solver with time windows. Pure functions, no I/O: callers supply a travel
 * matrix (Google Routes, or an estimate) and get back an ordered plan.
 *
 * Approach: build candidate orders (booking order, nearest neighbor), improve
 * each with 2-opt and relocate moves, and keep the cheapest. Cost is driving
 * time plus a steep penalty for every minute a stop is reached after its window.
 *
 * @module src/libs/routing/optimizer
 * @since 1.0.0
 */

export type LatLng = { lat: number; lng: number };

export type RouteStopInput = {
    id: string;
    /** Minutes after local midnight the crew may arrive (inclusive). */
    windowStart: number;
    /** Minutes after local midnight the crew should arrive by. */
    windowEnd: number;
    /** How long the job takes on site. */
    serviceMinutes: number;
};

/**
 * Travel matrix where index 0 is the starting point (shop/home) and index i
 * is stops[i - 1]. durations in seconds, distances in meters.
 */
export type TravelMatrix = { durations: number[][]; distances: number[][] };

export type PlanOptions = {
    /** Drive back to the start at the end of the day. */
    returnToStart?: boolean;
};

export type PlannedStop = {
    id: string;
    sequence: number;
    arrivalMinutes: number;
    departureMinutes: number;
    waitMinutes: number;
    lateMinutes: number;
    legSeconds: number;
    legMeters: number;
};

export type RoutePlan = {
    /** Indices into the input stops, in driving order. */
    order: number[];
    stops: PlannedStop[];
    departMinutes: number;
    totalDriveSeconds: number;
    totalMeters: number;
    totalLateMinutes: number;
    cost: number;
};

/** Seconds of driving a minute of lateness is "worth" when comparing orders. */
const LATE_PENALTY_SECONDS_PER_MINUTE = 600;

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng) {
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * A rough matrix from straight-line distance, for when no maps provider is
 * configured: roads are ~30% longer than the crow flies, averaged at 40 km/h.
 */
export function estimateMatrix(points: LatLng[], { detour = 1.3, speedKph = 40 } = {}): TravelMatrix {
    const metersPerSecond = (speedKph * 1000) / 3600;
    const distances = points.map((from) => points.map((to) => Math.round(haversineMeters(from, to) * detour)));
    const durations = distances.map((row) => row.map((meters) => Math.round(meters / metersPerSecond)));
    return { durations, distances };
}

/**
 * Simulates driving `order` and returns timings and cost. The day starts just
 * in time to reach the first stop at the opening of its window.
 */
export function evaluateOrder(order: number[], stops: RouteStopInput[], matrix: TravelMatrix, options: PlanOptions = {}): RoutePlan {
    let totalDriveSeconds = 0;
    let totalMeters = 0;
    let totalLateMinutes = 0;
    const planned: PlannedStop[] = [];

    const firstLeg = order.length ? matrix.durations[0][order[0] + 1] : 0;
    const departMinutes = order.length ? stops[order[0]].windowStart - firstLeg / 60 : 0;
    let clock = departMinutes;
    let previous = 0;

    order.forEach((stopIndex, position) => {
        const stop = stops[stopIndex];
        const node = stopIndex + 1;
        const legSeconds = matrix.durations[previous][node];
        const legMeters = matrix.distances[previous][node];
        totalDriveSeconds += legSeconds;
        totalMeters += legMeters;

        const arrival = clock + legSeconds / 60;
        const start = Math.max(arrival, stop.windowStart);
        const lateMinutes = Math.max(0, arrival - stop.windowEnd);
        totalLateMinutes += lateMinutes;

        planned.push({
            id: stop.id,
            sequence: position + 1,
            arrivalMinutes: start,
            departureMinutes: start + stop.serviceMinutes,
            waitMinutes: start - arrival,
            lateMinutes,
            legSeconds,
            legMeters,
        });
        clock = start + stop.serviceMinutes;
        previous = node;
    });

    if (options.returnToStart && order.length) {
        totalDriveSeconds += matrix.durations[previous][0];
        totalMeters += matrix.distances[previous][0];
    }

    return {
        order: [...order],
        stops: planned,
        departMinutes,
        totalDriveSeconds,
        totalMeters,
        totalLateMinutes,
        cost: totalDriveSeconds + totalLateMinutes * LATE_PENALTY_SECONDS_PER_MINUTE,
    };
}

/** The order jobs were booked in (by scheduled time). The "before" for savings. */
export function bookingOrder(stops: RouteStopInput[]) {
    return stops.map((_, index) => index).sort((a, b) => stops[a].windowStart - stops[b].windowStart || a - b);
}

function nearestNeighborOrder(stops: RouteStopInput[], matrix: TravelMatrix) {
    const remaining = new Set(stops.map((_, index) => index));
    const order: number[] = [];
    let previous = 0;
    let clock = Math.min(...stops.map((stop) => stop.windowStart));
    while (remaining.size) {
        let best = -1;
        let bestScore = Infinity;
        for (const index of remaining) {
            const arrival = clock + matrix.durations[previous][index + 1] / 60;
            // Prefer close stops, but don't wait around for one that opens much later.
            const wait = Math.max(0, stops[index].windowStart - arrival);
            const late = Math.max(0, arrival - stops[index].windowEnd);
            const score = matrix.durations[previous][index + 1] + wait * 30 + late * LATE_PENALTY_SECONDS_PER_MINUTE;
            if (score < bestScore || (score === bestScore && index < best)) {
                bestScore = score;
                best = index;
            }
        }
        const arrival = clock + matrix.durations[previous][best + 1] / 60;
        clock = Math.max(arrival, stops[best].windowStart) + stops[best].serviceMinutes;
        previous = best + 1;
        order.push(best);
        remaining.delete(best);
    }
    return order;
}

/** Local search: 2-opt segment reversals and single-stop relocations until nothing improves. */
function improve(order: number[], stops: RouteStopInput[], matrix: TravelMatrix, options: PlanOptions) {
    let best = evaluateOrder(order, stops, matrix, options);
    const n = order.length;
    let improved = true;
    let rounds = 0;

    while (improved && rounds < 100) {
        improved = false;
        rounds += 1;

        for (let i = 0; i < n - 1; i += 1) {
            for (let j = i + 1; j < n; j += 1) {
                const candidate = [...best.order.slice(0, i), ...best.order.slice(i, j + 1).reverse(), ...best.order.slice(j + 1)];
                const plan = evaluateOrder(candidate, stops, matrix, options);
                if (plan.cost < best.cost - 1e-6) {
                    best = plan;
                    improved = true;
                }
            }
        }

        for (let from = 0; from < n; from += 1) {
            for (let to = 0; to < n; to += 1) {
                if (from === to) continue;
                const candidate = [...best.order];
                const [moved] = candidate.splice(from, 1);
                candidate.splice(to, 0, moved);
                const plan = evaluateOrder(candidate, stops, matrix, options);
                if (plan.cost < best.cost - 1e-6) {
                    best = plan;
                    improved = true;
                }
            }
        }
    }
    return best;
}

/**
 * Plans the cheapest order through `stops`. Deterministic for the same input.
 */
export function optimizeRoute(stops: RouteStopInput[], matrix: TravelMatrix, options: PlanOptions = {}): RoutePlan {
    if (stops.length === 0) return evaluateOrder([], stops, matrix, options);

    const starts = [bookingOrder(stops), nearestNeighborOrder(stops, matrix)];
    return starts
        .map((order) => improve(order, stops, matrix, options))
        .reduce((best, plan) => (plan.cost < best.cost ? plan : best));
}
