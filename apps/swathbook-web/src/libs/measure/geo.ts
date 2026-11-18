/**
 * geo.ts
 *
 * The maths behind measuring an area on a satellite photo: converting between
 * points on a Static Maps image and latitude/longitude (Web Mercator, the
 * projection Google's tiles use), and the area of an outline in square feet.
 * Pure functions, shared by the booking page (drawing) and the server
 * (checking what was drawn).
 *
 * @module src/libs/measure/geo
 * @since 1.0.0
 */

export type LatLng = { lat: number; lng: number };
/** A drawn outline: [lat, lng] pairs, the way bookings.measurement stores them. */
export type Polygon = Array<[number, number]>;

const TILE_SIZE = 256;
const EARTH_RADIUS_M = 6_371_008.8;
const SQFT_PER_SQM = 10.763_910_4;

/** The image the booking page shows: 640×640 logical pixels (requested at scale 2). */
export const MAP_SIZE = 640;
/** Zoom levels the customer can pick between. 20 is closest; 18 fits a large lot. */
export const MAP_ZOOMS = [18, 19, 20] as const;
export type MapZoom = (typeof MAP_ZOOMS)[number];
export const DEFAULT_ZOOM: MapZoom = 20;

/** Upper bound on what anyone measures for a residential job: 10 acres. */
export const MAX_AREA_SQFT = 435_600;
export const MIN_AREA_SQFT = 100;
/** Drawn points must sit this close to the address (zoom 18's corners are ~250 m out). */
export const MAX_POINT_DISTANCE_M = 400;
export const MAX_POLYGONS = 6;
export const MAX_POLYGON_POINTS = 60;

function worldPoint({ lat, lng }: LatLng, zoom: number) {
    const scale = TILE_SIZE * 2 ** zoom;
    const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    return {
        x: ((lng + 180) / 360) * scale,
        y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
}

function fromWorldPoint(x: number, y: number, zoom: number): LatLng {
    const scale = TILE_SIZE * 2 ** zoom;
    const lng = (x / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
}

/** Where a lat/lng falls on a map image centered on `center`, in logical pixels from the top left. */
export function toImagePoint(point: LatLng, center: LatLng, zoom: number, size = MAP_SIZE) {
    const p = worldPoint(point, zoom);
    const c = worldPoint(center, zoom);
    return { x: p.x - c.x + size / 2, y: p.y - c.y + size / 2 };
}

/** The lat/lng under a point on the map image. */
export function fromImagePoint(x: number, y: number, center: LatLng, zoom: number, size = MAP_SIZE): LatLng {
    const c = worldPoint(center, zoom);
    return fromWorldPoint(c.x + x - size / 2, c.y + y - size / 2, zoom);
}

export function distanceMeters(a: LatLng, b: LatLng) {
    const toRad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRad;
    const dLng = (b.lng - a.lng) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Area of one outline in square feet. Projects onto a flat plane around the
 * outline's own latitude, which is exact to well under 1% at yard scale.
 */
export function polygonAreaSqft(polygon: Polygon) {
    if (polygon.length < 3) return 0;
    const lat0 = (polygon.reduce((sum, [lat]) => sum + lat, 0) / polygon.length) * (Math.PI / 180);
    const xy = polygon.map(([lat, lng]) => ({
        x: EARTH_RADIUS_M * ((lng * Math.PI) / 180) * Math.cos(lat0),
        y: EARTH_RADIUS_M * ((lat * Math.PI) / 180),
    }));
    let twiceArea = 0;
    for (let i = 0; i < xy.length; i++) {
        const a = xy[i];
        const b = xy[(i + 1) % xy.length];
        twiceArea += a.x * b.y - b.x * a.y;
    }
    return (Math.abs(twiceArea) / 2) * SQFT_PER_SQM;
}

export function totalAreaSqft(polygons: Polygon[]) {
    return Math.round(polygons.reduce((sum, polygon) => sum + polygonAreaSqft(polygon), 0));
}

export type MeasurementCheck = { ok: true; areaSqft: number; polygons: Polygon[] } | { ok: false; error: string };

function isPoint(value: unknown): value is [number, number] {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1]) &&
        Math.abs(value[0]) <= 90 &&
        Math.abs(value[1]) <= 180
    );
}

/**
 * Checks an outline sent from the browser against the address it's meant to
 * be at, and works out the area itself (the browser's figure isn't trusted).
 * Points are rounded to ~1 cm, which is all a photo can tell anyway.
 */
export function checkMeasurement(polygons: unknown, address: LatLng): MeasurementCheck {
    if (!Array.isArray(polygons) || polygons.length < 1 || polygons.length > MAX_POLYGONS) {
        return { ok: false, error: "Outline the area on the map, or enter its size." };
    }
    const clean: Polygon[] = [];
    for (const polygon of polygons) {
        if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_POLYGON_POINTS || !polygon.every(isPoint)) {
            return { ok: false, error: "That outline didn't come through. Draw it again." };
        }
        const rounded = polygon.map(([lat, lng]) => [Math.round(lat * 1e7) / 1e7, Math.round(lng * 1e7) / 1e7] as [number, number]);
        if (rounded.some(([lat, lng]) => distanceMeters({ lat, lng }, address) > MAX_POINT_DISTANCE_M)) {
            return { ok: false, error: "Outline the area at your address." };
        }
        clean.push(rounded);
    }
    return checkArea(totalAreaSqft(clean), clean);
}

export function checkArea(areaSqft: number, polygons: Polygon[] = []): MeasurementCheck {
    if (!Number.isFinite(areaSqft) || areaSqft < MIN_AREA_SQFT) {
        return { ok: false, error: `That's under ${MIN_AREA_SQFT} sq ft. Check the outline or the size you entered.` };
    }
    if (areaSqft > MAX_AREA_SQFT) {
        return { ok: false, error: "That's over 10 acres. Please contact the business for a quote." };
    }
    return { ok: true, areaSqft: Math.round(areaSqft), polygons };
}

export function formatSqft(areaSqft: number) {
    return `${Math.round(areaSqft).toLocaleString("en-US")} sq ft`;
}
