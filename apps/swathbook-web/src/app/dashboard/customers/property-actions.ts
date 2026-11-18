"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import type { FormState } from "@/libs/forms";
import { checkPropertyMap, propertyNotesSchema } from "@/libs/property";
import { createClient } from "@/libs/supabase/server";

const inputSchema = propertyNotesSchema.extend({ businessId: z.uuid(), addressId: z.uuid() });

/**
 * Saves an address's notes for the crew. Anyone on the team can (crews are
 * the ones who learn about the dog); the address itself stays with owners
 * and admins.
 */
export async function savePropertyNotes(input: z.input<typeof inputSchema>): Promise<FormState> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = [issue.message];
        return { error: "Check the highlighted fields.", fieldErrors };
    }
    const auth = await authorizeBusiness(parsed.data.businessId);
    if (isFailure(auth)) return auth;
    const { addressId, gateCode, pets, accessNotes, map } = parsed.data;

    const supabase = await createClient();
    const { data: address } = await supabase
        .from("customer_addresses")
        .select("id, lat, lng")
        .eq("id", addressId)
        .eq("business_id", auth.businessId)
        .maybeSingle();
    if (!address) return { error: "That address no longer exists." };

    const checked = checkPropertyMap(map, address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null);
    if (!checked.ok) return { error: checked.error };

    const { error } = await supabase.rpc("save_property_notes", {
        p_address_id: addressId,
        p_gate_code: gateCode,
        p_pets: pets,
        p_access_notes: accessNotes,
        // Null clears the map (the function takes no default for it).
        p_property_map: checked.map,
    });
    if (error) {
        console.error("[property] save_property_notes failed", error.code ?? error.message);
        return { error: "We couldn't save the property notes. Please try again." };
    }
    refresh();
    return { success: "Property notes saved." };
}
