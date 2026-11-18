"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FEEDBACK_STATUSES } from "@/libs/feedback";
import type { FormState } from "@/libs/forms";
import { createAdminClient } from "@/libs/supabase/admin";
import { requireStaff } from "./staff";

const updateSchema = z.object({
    id: z.uuid(),
    status: z.enum(FEEDBACK_STATUSES as [string, ...string[]]),
    response: z.string().trim().max(2000, { error: "Keep the reply under 2,000 characters." }),
});

/**
 * Staff triage: moves a note along and (optionally) replies. The sender sees
 * the status and the reply under "Your feedback".
 */
export async function updateFeedbackNote(_prev: FormState, formData: FormData): Promise<FormState> {
    await requireStaff();
    const parsed = updateSchema.safeParse({ id: formData.get("id"), status: formData.get("status"), response: formData.get("response") ?? "" });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the note and try again." };
    const { id, status, response } = parsed.data;

    const admin = createAdminClient();
    const { data: current } = await admin.from("feedback").select("response").eq("id", id).maybeSingle();
    if (!current) return { error: "That note no longer exists." };

    const reply = response || null;
    const { error } = await admin
        .from("feedback")
        .update({
            status: status as (typeof FEEDBACK_STATUSES)[number],
            response: reply,
            // Stamped when the reply changes, so "replied" means the latest words.
            ...(reply !== current.response ? { responded_at: reply ? new Date().toISOString() : null } : {}),
        })
        .eq("id", id);
    if (error) {
        console.error("[feedback] couldn't update a note", error.message);
        return { error: "We couldn't save that. Please try again." };
    }
    refresh();
    return { success: "Saved." };
}
