/**
 * feedback.ts
 *
 * Product feedback from early users (web dashboard, customer portal and both
 * mobile apps all write through submit_feedback()). This module holds the
 * shared labels and rules, the staff check for the /admin/feedback inbox, and
 * the digest that emails new notes to the team from the minute cron.
 *
 * @module src/libs/feedback
 * @since 1.0.0
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { siteConfig } from "./globals/site";
import { renderEmail } from "./email/layout";
import { sendEmail } from "./email/send";
import type { createAdminClient } from "./supabase/admin";
import type { Database } from "./supabase/database.types";

export type FeedbackKind = Database["public"]["Enums"]["feedback_kind"];
export type FeedbackSource = Database["public"]["Enums"]["feedback_source"];
export type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];

export const FEEDBACK_KINDS: Array<{ value: FeedbackKind; label: string; hint: string }> = [
    { value: "idea", label: "An idea", hint: "Something you wish it did" },
    { value: "problem", label: "Something's broken", hint: "An error, or it did the wrong thing" },
    { value: "praise", label: "Something I love", hint: "Tell us what to keep" },
    { value: "other", label: "Something else", hint: "Questions, confusion, anything" },
];

export const KIND_LABELS: Record<FeedbackKind, string> = { idea: "Idea", problem: "Problem", praise: "Praise", other: "Other" };

export const SOURCE_LABELS: Record<FeedbackSource, string> = { web: "Website", owner_app: "Owner app", client_app: "Customer app" };

/** How a status reads to the person who sent the note. */
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
    new: "Received",
    reviewing: "Looking into it",
    planned: "Planned",
    done: "Done",
    closed: "Closed",
};

export const RATING_LABELS = ["", "Not working for me", "Needs work", "It's OK", "Pretty good", "Love it"];

export const MESSAGE_MAX = 4000;

export const feedbackSchema = z.object({
    kind: z.enum(["idea", "problem", "praise", "other"], { error: "Pick what kind of feedback this is." }),
    message: z
        .string()
        .trim()
        .min(3, { error: "Tell us a little more." })
        .max(MESSAGE_MAX, { error: `Keep it under ${MESSAGE_MAX.toLocaleString("en-US")} characters.` }),
    rating: z.coerce.number().int().min(1).max(5).nullable().catch(null),
    contactOk: z.boolean(),
    /** The page they were on when they opened the form. */
    page: z
        .string()
        .max(300)
        .regex(/^\/[\w\-/.%[\]]*$/)
        .nullable()
        .catch(null),
});

export const FEEDBACK_ERRORS: Record<string, string> = {
    feedback_rate_limited: "That's a lot of feedback in a short time. Thank you! Try again in a little while.",
    invalid_message: "Tell us a little more (at least a few words).",
    not_signed_in: "Your session expired. Sign in again to send feedback.",
};

/** "Chrome on macOS" from a user agent, for context without storing the whole string. */
// Checked in order: Edge and Opera also say "Chrome", and Chrome also says "Safari".
const BROWSERS: Array<[RegExp, string]> = [
    [/Edg\//, "Edge"],
    [/OPR\//, "Opera"],
    [/Firefox\//, "Firefox"],
    [/Chrome\//, "Chrome"],
    [/Safari\//, "Safari"],
];
// iPhones and Android phones also mention Mac OS X and Linux.
const SYSTEMS: Array<[RegExp, string]> = [
    [/iPhone|iPad/, "iOS"],
    [/Android/, "Android"],
    [/Mac OS X/, "macOS"],
    [/Windows/, "Windows"],
    [/Linux/, "Linux"],
];

export function describeBrowser(userAgent: string | null | undefined) {
    if (!userAgent) return null;
    const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Browser";
    const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
    return os ? `${browser} on ${os}` : browser;
}

/**
 * Staff who can open the feedback inbox: SWATHBOOK_STAFF_EMAILS, comma
 * separated. Nobody when it's unset.
 */
export function isStaffEmail(email: string | null | undefined) {
    if (!email) return false;
    const staff = (process.env.SWATHBOOK_STAFF_EMAILS ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    return staff.includes(email.trim().toLowerCase());
}

export const FEEDBACK_STATUSES: FeedbackStatus[] = ["new", "reviewing", "planned", "done", "closed"];

/** How a status reads in the team's inbox. */
export const TEAM_STATUS_LABELS: Record<FeedbackStatus, string> = {
    new: "New",
    reviewing: "Reviewing",
    planned: "Planned",
    done: "Done",
    closed: "Closed",
};

/** Where the team's digest goes. */
export function feedbackInbox() {
    return process.env.FEEDBACK_EMAIL || siteConfig.supportEmail;
}

type Admin = ReturnType<typeof createAdminClient>;

const DIGEST_LIMIT = 25;

/**
 * Emails notes the team hasn't seen yet, in one message, and marks them.
 * Called every minute by the cron; does nothing when there's nothing new.
 * Notes stay unmarked if the email fails, so the next run retries them.
 */
export async function sendFeedbackDigest(admin: Admin, { baseUrl }: { baseUrl: string }) {
    const { data: notes, error } = await admin
        .from("feedback")
        .select("id, source, kind, rating, message, page, email, contact_ok, app_version, platform, created_at, businesses(name)")
        .is("team_notified_at", null)
        .order("created_at")
        .limit(DIGEST_LIMIT);
    if (error) {
        console.error("[feedback] couldn't load new notes", error.message);
        return { sent: 0 };
    }
    if (!notes?.length) return { sent: 0 };

    const count = notes.length;
    const { html, text } = renderEmail({
        preheader: notes[0].message.slice(0, 120),
        sender: { name: siteConfig.name },
        heading: count === 1 ? "New feedback" : `${count} new feedback notes`,
        paragraphs: notes.map((note) => {
            const sender = note.email && !note.contact_ok ? `${note.email} (no reply wanted)` : (note.email ?? "someone");
            const who = [sender, note.businesses?.name].filter(Boolean).join(", ");
            const context = [SOURCE_LABELS[note.source], note.page, note.app_version ? `v${note.app_version}` : null, note.platform].filter(Boolean).join(" · ");
            const rating = note.rating ? ` · ${note.rating}/5` : "";
            return `${KIND_LABELS[note.kind]}${rating} from ${who} (${context}): ${truncate(note.message, 600)}`;
        }),
        button: { label: "Open the feedback inbox", url: `${baseUrl}/admin/feedback` },
    });

    const result = await sendEmail({
        to: feedbackInbox(),
        subject: count === 1 ? `Feedback: ${truncate(notes[0].message, 60)}` : `${count} new feedback notes`,
        html,
        text,
        // A note whose sender wants a reply can be answered straight from the email.
        ...(count === 1 && notes[0].email && notes[0].contact_ok ? { replyTo: notes[0].email } : {}),
        idempotencyKey: `feedback-digest:${createHash("sha256").update(notes.map((note) => note.id).join(",")).digest("hex")}`,
    });
    if (!result.ok) {
        console.error("[feedback] digest not sent", result.error);
        return { sent: 0 };
    }
    await admin
        .from("feedback")
        .update({ team_notified_at: new Date().toISOString() })
        .in(
            "id",
            notes.map((note) => note.id),
        );
    return { sent: count };
}

function truncate(value: string, max: number) {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
