/**
 * investors.ts
 *
 * Investor interest from the public /investors page: the form's choices and
 * rules, and the digest that emails new interest to the team from the minute
 * cron. Rows are written and read only with the service role.
 *
 * @module src/libs/investors
 * @since 1.0.0
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { siteConfig } from "./globals/site";
import { renderEmail } from "./email/layout";
import { sendEmail } from "./email/send";
import type { createAdminClient } from "./supabase/admin";
import type { Database } from "./supabase/database.types";

export type InvestorType = Database["public"]["Enums"]["investor_type"];
export type CheckSize = Database["public"]["Enums"]["investor_check_size"];
export type InvestorStatus = Database["public"]["Enums"]["investor_status"];

export const INVESTOR_TYPES: Array<{ value: InvestorType; label: string }> = [
    { value: "angel", label: "Angel investor" },
    { value: "fund", label: "Venture fund" },
    { value: "family_office", label: "Family office" },
    { value: "strategic", label: "Strategic / corporate" },
    { value: "other", label: "Something else" },
];

export const CHECK_SIZES: Array<{ value: CheckSize; label: string }> = [
    { value: "under_25k", label: "Under $25k" },
    { value: "25k_100k", label: "$25k to $100k" },
    { value: "100k_250k", label: "$100k to $250k" },
    { value: "250k_plus", label: "$250k or more" },
    { value: "not_sure", label: "Not sure yet" },
];

export const INVESTOR_STATUSES: InvestorStatus[] = ["new", "contacted", "meeting", "committed", "passed"];

export const INVESTOR_STATUS_LABELS: Record<InvestorStatus, string> = {
    new: "New",
    contacted: "Contacted",
    meeting: "Meeting",
    committed: "Committed",
    passed: "Passed",
};

const labelOf = <T extends string>(options: Array<{ value: T; label: string }>, value: T) => options.find((option) => option.value === value)?.label ?? value;
export const investorTypeLabel = (value: InvestorType) => labelOf(INVESTOR_TYPES, value);
export const checkSizeLabel = (value: CheckSize) => labelOf(CHECK_SIZES, value);

export const MESSAGE_MAX = 4000;

const optional = (max: number, error: string) =>
    z
        .string()
        .trim()
        .max(max, { error })
        .transform((value) => value || null);

export const investorInterestSchema = z.object({
    fullName: z.string().trim().min(2, { error: "Tell us your name." }).max(120, { error: "Keep your name under 120 characters." }),
    // Trimmed before it's checked, so a stray space from autofill isn't an error.
    email: z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.email({ error: "Enter an email we can reach you at." }).max(320, { error: "That email is too long." })),
    firm: optional(160, "Keep the firm name under 160 characters."),
    investorType: z.enum(INVESTOR_TYPES.map((option) => option.value) as [InvestorType, ...InvestorType[]], { error: "Pick what kind of investor you are." }),
    checkSize: z.enum(CHECK_SIZES.map((option) => option.value) as [CheckSize, ...CheckSize[]]).catch("not_sure"),
    accredited: z.boolean(),
    message: optional(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX.toLocaleString("en-US")} characters.`),
});

export type InvestorInterest = z.infer<typeof investorInterestSchema>;

/** Where the team's digest goes. */
export function investorInbox() {
    return process.env.INVESTOR_EMAIL || process.env.FEEDBACK_EMAIL || siteConfig.supportEmail;
}

type Admin = ReturnType<typeof createAdminClient>;

const DIGEST_LIMIT = 25;

/**
 * Emails interest the team hasn't seen yet, in one message, and marks it.
 * Called every minute by the cron; does nothing when there's nothing new.
 * Rows stay unmarked if the email fails, so the next run retries them.
 */
export async function sendInvestorDigest(admin: Admin, { baseUrl }: { baseUrl: string }) {
    const { data: rows, error } = await admin
        .from("investor_interest")
        .select("id, full_name, email, firm, investor_type, check_size, accredited, message, created_at")
        .is("team_notified_at", null)
        .order("created_at")
        .limit(DIGEST_LIMIT);
    if (error) {
        console.error("[investors] couldn't load new interest", error.message);
        return { sent: 0 };
    }
    if (!rows?.length) return { sent: 0 };

    const count = rows.length;
    const { html, text } = renderEmail({
        preheader: `${rows[0].full_name}${rows[0].firm ? ` (${rows[0].firm})` : ""} is interested in investing`,
        sender: { name: siteConfig.name },
        heading: count === 1 ? "New investor interest" : `${count} new investors interested`,
        paragraphs: rows.map((row) => {
            const who = [row.full_name, row.firm, row.email].filter(Boolean).join(", ");
            const facts = [investorTypeLabel(row.investor_type), checkSizeLabel(row.check_size), row.accredited ? "accredited" : "not stated as accredited"].join(" · ");
            return `${who} (${facts})${row.message ? `: ${truncate(row.message, 600)}` : ""}`;
        }),
        button: { label: "Open investor interest", url: `${baseUrl}/admin/investors` },
    });

    const result = await sendEmail({
        to: investorInbox(),
        subject: count === 1 ? `Investor interest: ${rows[0].full_name}${rows[0].firm ? `, ${rows[0].firm}` : ""}` : `${count} new investors interested`,
        html,
        text,
        // One person can be answered straight from the email.
        ...(count === 1 ? { replyTo: rows[0].email } : {}),
        idempotencyKey: `investor-digest:${createHash("sha256").update(rows.map((row) => row.id).join(",")).digest("hex")}`,
    });
    if (!result.ok) {
        console.error("[investors] digest not sent", result.error);
        return { sent: 0 };
    }
    await admin
        .from("investor_interest")
        .update({ team_notified_at: new Date().toISOString() })
        .in(
            "id",
            rows.map((row) => row.id),
        );
    return { sent: count };
}

function truncate(value: string, max: number) {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
