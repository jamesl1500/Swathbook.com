/**
 * address.ts
 *
 * Reads an address posted by <AddressInput> (fields named `<prefix>.line1`,
 * etc.) and fills in coordinates when the browser didn't send them, so every
 * saved address can be routed.
 *
 * @module src/libs/address
 * @since 1.0.0
 */

import { z } from "zod";
import { geocodeAddress, hasGoogleMaps, placeDetails } from "./google/maps";

const optionalNumber = z.preprocess((value) => (value === "" || value == null ? null : Number(value)), z.number().nullable());

export const addressSchema = z.object({
    line1: z.string().trim().min(3, { error: "Enter a street address." }).max(200),
    line2: z.string().trim().max(200),
    city: z.string().trim().max(100),
    region: z.string().trim().max(100),
    postalCode: z.string().trim().max(20),
    placeId: z.string().trim().max(300),
    lat: optionalNumber.pipe(z.number().min(-90).max(90).nullable()),
    lng: optionalNumber.pipe(z.number().min(-180).max(180).nullable()),
});

export type ParsedAddress = z.output<typeof addressSchema>;

export function readAddress(formData: FormData, prefix = "address") {
    const value = (key: string) => {
        const raw = formData.get(`${prefix}.${key}`);
        return typeof raw === "string" ? raw : "";
    };
    return addressSchema.safeParse({
        line1: value("line1"),
        line2: value("line2"),
        city: value("city"),
        region: value("region"),
        postalCode: value("postalCode"),
        placeId: value("placeId"),
        lat: value("lat"),
        lng: value("lng"),
    });
}

/** Adds coordinates (and a Google place id) when missing and a maps key is set. */
export async function withCoordinates(address: ParsedAddress) {
    let { lat, lng, placeId } = address;
    let formatted: string | null = null;
    if ((lat == null || lng == null) && hasGoogleMaps()) {
        const resolved = placeId ? await placeDetails(placeId) : null;
        if (resolved?.lat != null && resolved.lng != null) {
            ({ lat, lng } = resolved);
            formatted = resolved.formatted;
        } else {
            const geocoded = await geocodeAddress([address.line1, address.city, address.region, address.postalCode].filter(Boolean).join(", "));
            if (geocoded) {
                ({ lat, lng } = geocoded);
                placeId ||= geocoded.placeId;
                formatted = geocoded.formatted;
            }
        }
    }
    return {
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city || null,
        region: address.region || null,
        postal_code: address.postalCode || null,
        lat,
        lng,
        google_place_id: placeId || null,
        formatted_address: formatted,
    };
}

export function formatAddress(address: { line1: string; line2?: string | null; city?: string | null; region?: string | null; postal_code?: string | null }) {
    const cityLine = [address.city, [address.region, address.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return [address.line1, address.line2, cityLine].filter(Boolean).join(", ");
}
