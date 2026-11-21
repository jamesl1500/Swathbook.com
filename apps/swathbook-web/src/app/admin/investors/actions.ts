"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/libs/forms";
import { INVESTOR_STATUSES } from "@/libs/investors";
import { routes } from "@/libs/routes";
import { createAdminClient } from "@/libs/supabase/admin";
import { requireStaff } from "../feedback/staff";

const updateSchema = z.object({
    id: z.uuid(),
    status: z.enum(INVESTOR_STATUSES as [string, ...string[]]),
    notes: z.string().trim().max(4000, { error: "Keep notes under 4,000 characters." }),
});

/** Staff follow-up: where a conversation stands, plus private notes. */
export async function updateInvestor(_prev: FormState, formData: FormData): Promise<FormState> {
    await requireStaff(routes.investorInbox);
    const parsed = updateSchema.safeParse({ id: formData.get("id"), status: formData.get("status"), notes: formData.get("notes") ?? "" });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
    const { id, status, notes } = parsed.data;

    const { data, error } = await createAdminClient()
        .from("investor_interest")
        .update({ status: status as (typeof INVESTOR_STATUSES)[number], notes: notes || null })
        .eq("id", id)
        .select("id");
    if (error) {
        console.error("[investors] couldn't update", error.message);
        return { error: "We couldn't save that. Please try again." };
    }
    if (!data?.length) return { error: "That entry no longer exists." };
    refresh();
    return { success: "Saved." };
}
