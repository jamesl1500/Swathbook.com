"use server";

import { z } from "zod";
import { autocompleteAddress, placeDetails, type AddressSuggestion, type ResolvedAddress } from "@/libs/google/maps";

/*
 * Address lookup for forms (public booking page and dashboard). Proxied through
 * the server so the Google key never reaches the browser. Inputs are bounded
 * and tied to a per-form session token, which Google uses to bill a lookup
 * session as one request.
 */

const sessionToken = z.uuid();

export async function suggestAddresses(query: string, token: string): Promise<AddressSuggestion[]> {
    if (typeof query !== "string" || query.length > 200 || !sessionToken.safeParse(token).success) return [];
    return autocompleteAddress(query, token);
}

export async function resolveAddress(placeId: string, token: string): Promise<ResolvedAddress | null> {
    if (typeof placeId !== "string" || !sessionToken.safeParse(token).success) return null;
    return placeDetails(placeId, token);
}
