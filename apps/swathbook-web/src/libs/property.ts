/**
 * property.ts
 *
 * Property notes for crews: the gate code, pets, and a map of the property
 * with pins (gate, dog, hazard, spigot...) and areas (keep off, careful).
 * Stored on customer_addresses (property_map is the JSON below) and edited
 * through save_property_notes(). Pure helpers, shared by the editor and the
 * server action that checks what it sends.
 *
 * @module src/libs/property
 * @since 1.0.0
 */

import { z } from "zod";
import { distanceMeters, MAX_POINT_DISTANCE_M, type LatLng } from "./measure/geo";

export const MARKER_KINDS = ["gate", "pet", "hazard", "water", "parking", "power", "note"] as const;
export const AREA_KINDS = ["avoid", "careful"] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];
export type AreaKind = (typeof AREA_KINDS)[number];

export const MARKER_LABELS: Record<MarkerKind, string> = {
    gate: "Gate",
    pet: "Pet",
    hazard: "Hazard",
    water: "Spigot",
    parking: "Parking",
    power: "Outlet",
    note: "Note",
};

export const AREA_LABELS: Record<AreaKind, string> = {
    avoid: "Keep off",
    careful: "Careful",
};

export const MAX_MARKERS = 30;
export const MAX_AREAS = 10;
export const MAX_AREA_POINTS = 60;

const label = z.string().trim().max(60);
const coordinate = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);

export const propertyMapSchema = z.object({
    markers: z
        .array(z.object({ kind: z.enum(MARKER_KINDS), label, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }))
        .max(MAX_MARKERS)
        .default([]),
    areas: z
        .array(z.object({ kind: z.enum(AREA_KINDS), label, points: z.array(coordinate).min(3).max(MAX_AREA_POINTS) }))
        .max(MAX_AREAS)
        .default([]),
});

export type PropertyMap = z.output<typeof propertyMapSchema>;
export type PropertyMarker = PropertyMap["markers"][number];
export type PropertyArea = PropertyMap["areas"][number];

export const propertyNotesSchema = z.object({
    gateCode: z.string().trim().max(40, { error: "Keep the gate code under 40 characters." }),
    pets: z.string().trim().max(200, { error: "Keep it under 200 characters." }),
    accessNotes: z.string().trim().max(500, { error: "Keep notes under 500 characters." }),
    map: propertyMapSchema.nullable(),
});

export type PropertyNotes = z.output<typeof propertyNotesSchema>;

/** A stored property_map, or an empty one when it's missing or not what we expect. */
export function readPropertyMap(value: unknown): PropertyMap {
    const parsed = propertyMapSchema.safeParse(value ?? {});
    return parsed.success ? parsed.data : { markers: [], areas: [] };
}

export function isEmptyMap(map: PropertyMap) {
    return map.markers.length === 0 && map.areas.length === 0;
}

/**
 * Keeps the map to the property: every pin and corner near the address.
 * Rounds to ~1 cm and drops empty maps to null.
 */
export function checkPropertyMap(map: PropertyMap | null, address: LatLng | null): { ok: true; map: PropertyMap | null } | { ok: false; error: string } {
    if (!map || isEmptyMap(map)) return { ok: true, map: null };
    if (!address) return { ok: false, error: "This address isn't on the map yet, so it can't have pins." };
    const round = (value: number) => Math.round(value * 1e7) / 1e7;
    const near = (lat: number, lng: number) => distanceMeters({ lat, lng }, address) <= MAX_POINT_DISTANCE_M;
    if (!map.markers.every((marker) => near(marker.lat, marker.lng)) || !map.areas.every((area) => area.points.every(([lat, lng]) => near(lat, lng)))) {
        return { ok: false, error: "Keep pins and areas on the property." };
    }
    return {
        ok: true,
        map: {
            markers: map.markers.map((marker) => ({ ...marker, lat: round(marker.lat), lng: round(marker.lng) })),
            areas: map.areas.map((area) => ({ ...area, points: area.points.map(([lat, lng]) => [round(lat), round(lng)] as [number, number]) })),
        },
    };
}

/** True when there's anything for the crew to read. */
export function hasPropertyNotes(address: { gate_code?: string | null; pets?: string | null; access_notes?: string | null; property_map?: unknown }) {
    return Boolean(address.gate_code || address.pets || address.access_notes || !isEmptyMap(readPropertyMap(address.property_map)));
}
