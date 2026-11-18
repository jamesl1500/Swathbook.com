"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/libs/auth";
import { describeBrowser, FEEDBACK_ERRORS, feedbackSchema } from "@/libs/feedback";
import { checkbox, text, type FormState } from "@/libs/forms";
import { createClient } from "@/libs/supabase/server";

/**
 * Sends feedback from the website (the dashboard or the customer portal) as
 * the signed-in person. submit_feedback() fills in who they are, checks the
 * business is one they're on, and rate limits.
 */
export async function sendFeedback(_prev: FormState, formData: FormData): Promise<FormState> {
    const user = await getCurrentUser();
    if (!user) return { error: FEEDBACK_ERRORS.not_signed_in };

    const parsed = feedbackSchema.safeParse({
        kind: text(formData, "kind") || undefined,
        message: text(formData, "message"),
        rating: text(formData, "rating") || null,
        contactOk: checkbox(formData, "contactOk"),
        page: text(formData, "page") || null,
    });
    if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= [issue.message];
        return { error: "Check the highlighted fields.", fieldErrors };
    }
    const businessId = z.uuid().safeParse(formData.get("businessId"));
    const { kind, message, rating, contactOk, page } = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_feedback", {
        p_source: "web",
        p_kind: kind,
        p_message: message,
        p_contact_ok: contactOk,
        ...(rating ? { p_rating: rating } : {}),
        ...(page ? { p_page: page } : {}),
        ...(businessId.success ? { p_business_id: businessId.data } : {}),
        p_platform: describeBrowser((await headers()).get("user-agent")) ?? undefined,
    });
    if (error) {
        const known = Object.keys(FEEDBACK_ERRORS).find((code) => error.message.includes(code));
        if (!known) console.error("[feedback] submit_feedback failed", error.code ?? error.message);
        return { error: known ? FEEDBACK_ERRORS[known] : "We couldn't send that. Please try again." };
    }
    refresh();
    return { success: "Thanks! Your feedback went straight to the team. We read every note." };
}
