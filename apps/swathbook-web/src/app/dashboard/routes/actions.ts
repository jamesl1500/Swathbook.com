"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { text, type FormState } from "@/libs/forms";
import { planDayRoute } from "@/libs/routing/plan";
import { createAdminClient } from "@/libs/supabase/admin";
import { createClient } from "@/libs/supabase/server";
import { isDateKey } from "@/libs/time";

export async function planRoute(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const parsed = z
        .object({ memberId: z.uuid(), date: z.string().refine(isDateKey) })
        .safeParse({ memberId: text(formData, "memberId"), date: text(formData, "date") });
    if (!parsed.success) return { error: "Pick a crew member and a day." };

    const db = await createClient();
    const [{ data: business }, { data: member }] = await Promise.all([
        db.from("businesses").select("id, timezone, base_address, base_lat, base_lng, arrival_window_minutes").eq("id", auth.businessId).single(),
        db.from("business_members").select("id").eq("id", parsed.data.memberId).eq("business_id", auth.businessId).maybeSingle(),
    ]);
    if (!business || !member) return { error: "That crew member isn't part of this business." };

    const result = await planDayRoute({ db, admin: createAdminClient() }, business, parsed.data);
    if (!result.ok) return { error: result.error };

    refresh();
    const saved = Math.round(result.savedSeconds / 60);
    const parts = [`Planned ${result.stopCount} ${result.stopCount === 1 ? "stop" : "stops"}`];
    if (saved > 0) parts.push(`saving about ${saved} min of driving`);
    if (result.excluded.length) parts.push(`${result.excluded.length} without a mappable address were left off`);
    return { success: `${parts.join(", ")}.` };
}

const STOP_STATUSES = ["pending", "en_route", "arrived", "completed", "skipped"] as const;

/** Crew update their own stops; owners and admins can update any. */
export async function setStopStatus(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    const status = z.enum(STOP_STATUSES).safeParse(text(formData, "status"));
    if (!status.success) return { error: "Pick a valid status." };

    const db = await createClient();
    const { error } = await db.rpc("update_route_stop_status", { p_stop_id: text(formData, "stopId"), p_status: status.data });
    if (error) return { error: error.message.includes("not_allowed") ? "Only the assigned crew member can update this stop." : "We couldn't update the stop." };
    refresh();
    return {};
}
