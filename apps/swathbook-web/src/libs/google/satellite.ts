/**
 * satellite.ts
 *
 * Satellite photos for measuring an area on the booking page. The browser
 * never sees the Google key: the server hands out short-lived signed links to
 * /api/maps/satellite, which checks the signature and fetches the photo. A
 * link only works for the spot and zoom it was signed for, so the proxy can't
 * be used as a free map service.
 *
 * @module src/libs/google/satellite
 * @since 1.0.0
 */

import { MAP_SIZE, MAP_ZOOMS, type LatLng, type MapZoom } from "@/libs/measure/geo";
import { coordinate, sign, signatureMatches, signingKey as keyFor } from "@/libs/signing";
import { hasGoogleMaps } from "./maps";

const LINK_TTL_SECONDS = 2 * 60 * 60;

// A key of its own, so a signature here is never useful anywhere else.
const signingKey = () => keyFor("satellite");

function payload(center: LatLng, zoom: number, expires: number) {
    return `${coordinate(center.lat)},${coordinate(center.lng)}|${zoom}|${expires}`;
}

export function canMeasure() {
    return hasGoogleMaps() && signingKey() !== null;
}

/** Signed photo links for each zoom level, centered on the address. */
export function satelliteLinks(center: LatLng, now = Date.now()): Record<MapZoom, string> | null {
    const key = signingKey();
    if (!key || !hasGoogleMaps()) return null;
    const expires = Math.floor(now / 1000) + LINK_TTL_SECONDS;
    const links = {} as Record<MapZoom, string>;
    for (const zoom of MAP_ZOOMS) {
        const params = new URLSearchParams({
            c: `${coordinate(center.lat)},${coordinate(center.lng)}`,
            z: String(zoom),
            e: String(expires),
            s: sign(key, payload(center, zoom, expires)),
        });
        links[zoom] = `/api/maps/satellite?${params.toString()}`;
    }
    return links;
}

export type SatelliteRequest = { center: LatLng; zoom: MapZoom };

/** Reads and checks a signed link's query. Null when it's forged, altered or expired. */
export function verifySatelliteLink(query: URLSearchParams, now = Date.now()): SatelliteRequest | null {
    const key = signingKey();
    const [latText, lngText] = (query.get("c") ?? "").split(",");
    const zoom = Number(query.get("z"));
    const expires = Number(query.get("e"));
    const signature = query.get("s") ?? "";
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (!(MAP_ZOOMS as readonly number[]).includes(zoom) || !Number.isInteger(expires) || expires * 1000 < now) return null;

    if (!signatureMatches(key, payload({ lat, lng }, zoom, expires), signature)) return null;
    return { center: { lat, lng }, zoom: zoom as MapZoom };
}

/**
 * A satellite photo with the customer's outline drawn on it, framed to fit
 * (Static Maps zooms to the paths). Includes the key: server only.
 */
export function measurementMapUrl(polygons: Array<Array<[number, number]>>) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const shapes = polygons.filter((polygon) => Array.isArray(polygon) && polygon.length >= 3).slice(0, 10);
    if (!key || !shapes.length) return null;
    const params = new URLSearchParams({ size: "640x400", scale: "2", maptype: "satellite", key });
    for (const polygon of shapes) {
        // Closed, so the outline joins back to its first point.
        const points = [...polygon, polygon[0]].map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`);
        params.append("path", ["color:0xffffffff", "weight:3", "fillcolor:0x1f5a3a66", ...points].join("|"));
    }
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/** The Static Maps URL behind a verified link (includes the key: server only). */
export function satelliteImageUrl({ center, zoom }: SatelliteRequest) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;
    const params = new URLSearchParams({
        center: `${coordinate(center.lat)},${coordinate(center.lng)}`,
        zoom: String(zoom),
        size: `${MAP_SIZE}x${MAP_SIZE}`,
        scale: "2",
        maptype: "satellite",
        key,
    });
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
