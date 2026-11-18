/**
 * signing.ts
 *
 * Short-lived values the server hands to the browser and later trusts again
 * (satellite photo links, the coordinates of a looked-up address). Each use
 * gets its own key derived from SUPABASE_SECRET_KEY, so a signature made for
 * one purpose is never valid for another.
 *
 * @module src/libs/signing
 * @since 1.0.0
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { LatLng } from "@/libs/measure/geo";

export type SigningPurpose = "satellite" | "location";

export function signingKey(purpose: SigningPurpose) {
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!secret) return null;
    return createHash("sha256").update(`swathbook:${purpose}:${secret}`).digest();
}

export function sign(key: Buffer, message: string) {
    return createHmac("sha256", key).update(message).digest("base64url");
}

/** Constant-time check of a signature against the expected one. */
export function signatureMatches(key: Buffer, message: string, signature: string) {
    const expected = Buffer.from(sign(key, message));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Coordinates to the ~10 cm the app works in, so signing and checking agree. */
export function coordinate(value: number) {
    return value.toFixed(6);
}

const LOCATION_TTL_SECONDS = 6 * 60 * 60;

/** Street and ZIP, normalized: what a location token is tied to. */
export function addressKey(address: { line1: string; postalCode?: string | null }) {
    const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return createHash("sha256").update(`${normalize(address.line1)}|${normalize(address.postalCode)}`).digest("base64url").slice(0, 16);
}

/**
 * A token vouching that the server found `location` for an address (from
 * Google, or as entered when maps aren't configured). The booking page sends
 * it back so neighbor pricing, the service-area check and measuring use
 * coordinates the browser couldn't have made up. Tied to the street and ZIP
 * it was found for, so it can't be carried over to a different address.
 */
export function signLocation(location: LatLng, address: { line1: string; postalCode?: string | null }, now = Date.now()): string | null {
    const key = signingKey("location");
    if (!key) return null;
    const expires = Math.floor(now / 1000) + LOCATION_TTL_SECONDS;
    const message = `${coordinate(location.lat)},${coordinate(location.lng)}|${addressKey(address)}|${expires}`;
    return `${message}|${sign(key, message)}`;
}

/**
 * The coordinates in a location token, or null when it's forged, altered,
 * expired, or (when `address` is given) was issued for a different address.
 */
export function verifyLocation(
    token: string | null | undefined,
    address?: { line1: string; postalCode?: string | null },
    now = Date.now(),
): LatLng | null {
    const key = signingKey("location");
    if (!key || typeof token !== "string" || token.length > 200) return null;
    const parts = token.split("|");
    if (parts.length !== 4) return null;
    const [point, place, expiresText, signature] = parts;
    const [lat, lng] = point.split(",").map(Number);
    const expires = Number(expiresText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (!Number.isInteger(expires) || expires * 1000 < now) return null;
    if (!signatureMatches(key, `${point}|${place}|${expiresText}`, signature)) return null;
    if (address && place !== addressKey(address)) return null;
    return { lat, lng };
}
