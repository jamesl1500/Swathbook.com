"use server";

import { z } from "zod";
import { autocompleteAddress, hasGoogleMaps, placeDetails, type AddressSuggestion, type ResolvedAddress } from "@/libs/google/maps";
import { allowRequest } from "@/libs/rate-limit";
import { signLocation } from "@/libs/signing";

/*
 * Address lookup for forms (public booking page and dashboard). Proxied through
 * the server so the Google key never reaches the browser. Inputs are bounded
 * and tied to a per-form session token, which Google uses to bill a lookup
 * session as one request. Anyone can call these, so each IP gets a budget.
 */

const sessionToken = z.uuid();

export async function suggestAddresses(query: string, token: string): Promise<AddressSuggestion[]> {
    if (typeof query !== "string" || query.trim().length < 3 || query.length > 200 || !sessionToken.safeParse(token).success) return [];
    if (!hasGoogleMaps() || !(await allowRequest("addressSuggest"))) return [];
    return autocompleteAddress(query, token);
}

/** A picked suggestion, with the server's signature on its coordinates (see signLocation). */
export type PickedAddress = ResolvedAddress & { locationToken: string | null };

export async function resolveAddress(placeId: string, token: string): Promise<PickedAddress | null> {
    if (typeof placeId !== "string" || placeId.length > 300 || !sessionToken.safeParse(token).success) return null;
    if (!hasGoogleMaps() || !(await allowRequest("addressResolve"))) return null;
    const resolved = await placeDetails(placeId, token);
    if (!resolved) return null;
    const locationToken = resolved.lat != null && resolved.lng != null ? signLocation({ lat: resolved.lat, lng: resolved.lng }, resolved) : null;
    return { ...resolved, locationToken };
}
