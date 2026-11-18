/**
 * maps.ts
 *
 * Google Maps Platform over REST, server-side only so the API key never
 * reaches the browser: Places (autocomplete + details), Geocoding, Routes
 * (travel matrix + route polyline) and Static Maps.
 *
 * Every function degrades gracefully: without GOOGLE_MAPS_API_KEY, callers
 * get null/[] and fall back to typed addresses and estimated drive times.
 *
 * @module src/libs/google/maps
 * @since 1.0.0
 */

import { estimateMatrix, type LatLng, type TravelMatrix } from "@/libs/routing/optimizer";
import { classifyMapsError, MAPS_PROBLEM_HINTS, networkProblem, type MapsProblem } from "./problems";

export type { MapsProblem } from "./problems";

const TIMEOUT_MS = 8000;

function apiKey() {
    return process.env.GOOGLE_MAPS_API_KEY || null;
}

export function hasGoogleMaps() {
    return Boolean(apiKey());
}

export type AddressSuggestion = {
    placeId: string;
    primary: string;
    secondary: string;
};

export type ResolvedAddress = {
    placeId: string | null;
    formatted: string;
    line1: string;
    line2?: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string;
    lat: number | null;
    lng: number | null;
};

type GoogleInit = RequestInit & { fieldMask?: string; api: string };
type GoogleResult<T> = { data: T; problem: null } | { data: null; problem: MapsProblem | null };

function logProblem(url: string, problem: MapsProblem) {
    console.error(`[google] ${problem.api} refused (${problem.reason}: ${MAPS_PROBLEM_HINTS[problem.reason]}) at ${url.split("?")[0]}: ${problem.detail}`);
}

/** A Maps request that says why it failed. `problem` is null only when there's no key at all. */
async function googleRequest<T>(url: string, { fieldMask, headers, api, ...rest }: GoogleInit): Promise<GoogleResult<T>> {
    const key = apiKey();
    if (!key) return { data: null, problem: null };
    try {
        const response = await fetch(url, {
            ...rest,
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": key,
                ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
                ...headers,
            },
        });
        if (!response.ok) {
            const problem = classifyMapsError(api, response.status, await response.text());
            logProblem(url, problem);
            return { data: null, problem };
        }
        return { data: (await response.json()) as T, problem: null };
    } catch (error) {
        const problem = networkProblem(api, error);
        logProblem(url, problem);
        return { data: null, problem };
    }
}

async function googleFetch<T>(url: string, init: GoogleInit): Promise<T | null> {
    return (await googleRequest<T>(url, init)).data;
}

type AutocompleteResponse = {
    suggestions?: Array<{
        placePrediction?: {
            placeId: string;
            text?: { text: string };
            structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        };
    }>;
};

export async function autocompleteAddress(input: string, sessionToken: string): Promise<AddressSuggestion[]> {
    const query = input.trim();
    if (query.length < 3) return [];
    const data = await googleFetch<AutocompleteResponse>("https://places.googleapis.com/v1/places:autocomplete", {
        api: "Places API (New)",
        method: "POST",
        body: JSON.stringify({
            input: query.slice(0, 200),
            sessionToken,
            includedRegionCodes: ["us"],
            includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        }),
    });
    return (data?.suggestions ?? [])
        .map((suggestion) => suggestion.placePrediction)
        .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
        .slice(0, 5)
        .map((prediction) => ({
            placeId: prediction.placeId,
            primary: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
            secondary: prediction.structuredFormat?.secondaryText?.text ?? "",
        }));
}

type AddressComponent = { longText: string; shortText: string; types: string[] };

/** Turns Google address components into our address fields. */
export function addressFromComponents(components: AddressComponent[]) {
    const find = (type: string) => components.find((component) => component.types.includes(type));
    const streetNumber = find("street_number")?.longText;
    const route = find("route")?.shortText;
    return {
        line1: [streetNumber, route].filter(Boolean).join(" "),
        line2: find("subpremise")?.longText ? `#${find("subpremise")!.longText}` : null,
        city: find("locality")?.longText ?? find("sublocality")?.longText ?? find("postal_town")?.longText ?? null,
        region: find("administrative_area_level_1")?.shortText ?? null,
        postalCode: find("postal_code")?.longText ?? null,
        country: find("country")?.shortText ?? "US",
    };
}

export async function placeDetails(placeId: string, sessionToken?: string): Promise<ResolvedAddress | null> {
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
    const query = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
    const data = await googleFetch<{
        id: string;
        formattedAddress?: string;
        addressComponents?: AddressComponent[];
        location?: { latitude: number; longitude: number };
    }>(`https://places.googleapis.com/v1/places/${placeId}${query}`, {
        api: "Places API (New)",
        fieldMask: "id,formattedAddress,addressComponents,location",
    });
    if (!data) return null;
    const parts = addressFromComponents(data.addressComponents ?? []);
    return {
        placeId: data.id,
        formatted: data.formattedAddress ?? parts.line1,
        ...parts,
        line1: parts.line1 || (data.formattedAddress ?? "").split(",")[0],
        lat: data.location?.latitude ?? null,
        lng: data.location?.longitude ?? null,
    };
}

export async function geocodeAddress(
    address: string,
    report?: (problem: MapsProblem) => void,
): Promise<(LatLng & { placeId: string; formatted: string }) | null> {
    const key = apiKey();
    if (!key || address.trim().length < 5) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const { data, problem } = await googleRequest<{
        status: string;
        error_message?: string;
        results: Array<{ place_id: string; formatted_address: string; geometry: { location: LatLng } }>;
    }>(url, { api: "Geocoding API", method: "GET" });
    if (problem) report?.(problem);
    // Geocoding refuses with a 200 and a status, not an HTTP error.
    if (data && !["OK", "ZERO_RESULTS"].includes(data.status)) {
        const refused = classifyMapsError("Geocoding API", 200, JSON.stringify(data));
        logProblem(url, refused);
        report?.(refused);
        return null;
    }
    const result = data?.status === "OK" ? data.results[0] : undefined;
    return result
        ? { lat: result.geometry.location.lat, lng: result.geometry.location.lng, placeId: result.place_id, formatted: result.formatted_address }
        : null;
}

function waypoint(point: LatLng) {
    return { waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } } };
}

/**
 * Drive times between every pair of points (max 25). Missing pairs, or no API
 * key at all, fall back to the straight-line estimate; `problem` says why
 * Google didn't answer, when it refused.
 */
export async function travelMatrix(
    points: LatLng[],
): Promise<{ matrix: TravelMatrix; source: "google" | "estimate"; problem: MapsProblem | null }> {
    const estimate = estimateMatrix(points);
    if (!hasGoogleMaps() || points.length < 2 || points.length > 25) return { matrix: estimate, source: "estimate", problem: null };

    const { data: elements, problem } = await googleRequest<
        Array<{ originIndex: number; destinationIndex: number; duration?: string; distanceMeters?: number; condition?: string }>
    >("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        api: "Routes API",
        method: "POST",
        fieldMask: "originIndex,destinationIndex,duration,distanceMeters,condition",
        body: JSON.stringify({
            origins: points.map(waypoint),
            destinations: points.map(waypoint),
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
        }),
    });
    if (!elements?.length) return { matrix: estimate, source: "estimate", problem };

    const durations = estimate.durations.map((row) => [...row]);
    const distances = estimate.distances.map((row) => [...row]);
    for (const element of elements) {
        if (element.condition !== "ROUTE_EXISTS" || element.originIndex === element.destinationIndex) continue;
        durations[element.originIndex][element.destinationIndex] = Number.parseInt(element.duration ?? "0", 10);
        distances[element.originIndex][element.destinationIndex] = element.distanceMeters ?? 0;
    }
    return { matrix: { durations, distances }, source: "google", problem: null };
}

/** Encoded polyline of the driving route through `points` in order. `report` hears why Google refused, if it did. */
export async function routePolyline(points: LatLng[], report?: (problem: MapsProblem) => void): Promise<string | null> {
    if (points.length < 2 || points.length > 27) return null;
    const [origin, ...rest] = points;
    const destination = rest[rest.length - 1];
    const { data, problem } = await googleRequest<{ routes?: Array<{ polyline?: { encodedPolyline?: string } }> }>(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
            api: "Routes API",
            method: "POST",
            fieldMask: "routes.polyline.encodedPolyline",
            body: JSON.stringify({
                origin: waypoint(origin).waypoint,
                destination: waypoint(destination).waypoint,
                intermediates: rest.slice(0, -1).map((point) => waypoint(point).waypoint),
                travelMode: "DRIVE",
                polylineQuality: "OVERVIEW",
            }),
        },
    );
    if (problem) report?.(problem);
    return data?.routes?.[0]?.polyline?.encodedPolyline ?? null;
}

/**
 * Static map URL (includes the API key, so only fetch it server-side; the app
 * serves it through /api/maps/route/[id]).
 */
export function staticMapUrl({ start, stops, polyline }: { start: LatLng | null; stops: LatLng[]; polyline: string | null }) {
    const key = apiKey();
    if (!key) return null;
    const params = new URLSearchParams({ size: "640x400", scale: "2", key });
    if (start) params.append("markers", `color:0x14261b|label:H|${start.lat},${start.lng}`);
    stops.forEach((stop, index) => {
        const label = index < 9 ? String(index + 1) : String.fromCharCode(65 + index - 9);
        params.append("markers", `color:0x1f5a3a|label:${label}|${stop.lat},${stop.lng}`);
    });
    if (polyline) params.append("path", `color:0x1f5a3aff|weight:5|enc:${polyline}`);
    else if (start || stops.length > 1) {
        params.append("path", ["color:0x1f5a3acc|weight:4", ...[start, ...stops].filter(Boolean).map((point) => `${point!.lat},${point!.lng}`)].join("|"));
    }
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/** Turn-by-turn in the Google Maps app; no API key needed. */
export function navigationUrl(points: LatLng[], origin?: LatLng | null) {
    if (!points.length) return null;
    const destination = points[points.length - 1];
    const params = new URLSearchParams({ api: "1", travelmode: "driving", destination: `${destination.lat},${destination.lng}` });
    if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
    const waypoints = points.slice(0, -1).map((point) => `${point.lat},${point.lng}`);
    if (waypoints.length) params.set("waypoints", waypoints.join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
}
