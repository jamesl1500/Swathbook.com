"use server";

import { checkbox, invalid, text, type FormState } from "@/libs/forms";
import { siteConfig } from "@/libs/globals/site";
import { investorInterestSchema } from "@/libs/investors";
import { RATE_LIMITED_MESSAGE, allowRequest } from "@/libs/rate-limit";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";

const THANKS = "Thanks! We've got your details and will be in touch personally, usually within a few days.";

/**
 * Registers interest from the public /investors page. Anyone can call it, so
 * it's rate limited per visitor, and a hidden field catches simple bots.
 * The team hears about it from the minute cron (sendInvestorDigest).
 */
export async function registerInvestorInterest(_prev: FormState, formData: FormData): Promise<FormState> {
    // Filled in only by bots (the field is hidden from people). Look successful so they move on.
    if (text(formData, "website")) return { success: THANKS };

    const parsed = investorInterestSchema.safeParse({
        fullName: text(formData, "fullName"),
        email: text(formData, "email"),
        firm: text(formData, "firm"),
        investorType: text(formData, "investorType") || undefined,
        checkSize: text(formData, "checkSize"),
        accredited: checkbox(formData, "accredited"),
        message: text(formData, "message"),
    });
    if (!parsed.success) return invalid(parsed.error);

    if (!hasAdminClient()) return { error: `We couldn't send that right now. Email us at ${siteConfig.supportEmail} instead.` };
    if (!(await allowRequest("investorInterest"))) return { error: RATE_LIMITED_MESSAGE };

    const { fullName, email, firm, investorType, checkSize, accredited, message } = parsed.data;
    const { error } = await createAdminClient().from("investor_interest").insert({
        full_name: fullName,
        email,
        firm,
        investor_type: investorType,
        check_size: checkSize,
        accredited,
        message,
    });
    if (error) {
        console.error("[investors] couldn't save interest", error.code ?? error.message);
        return { error: `We couldn't send that. Please try again, or email us at ${siteConfig.supportEmail}.` };
    }
    return { success: THANKS };
}
