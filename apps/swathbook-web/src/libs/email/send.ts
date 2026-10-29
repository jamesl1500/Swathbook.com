/**
 * send.ts
 *
 * One way out for every email. Production uses Resend; local development and
 * end-to-end tests deliver to the local Supabase Mailpit inbox instead, so
 * nothing ever reaches a real address by accident.
 *
 * @module src/libs/email/send
 * @since 1.0.0
 */

import { Resend } from "resend";
import { siteConfig } from "@/libs/globals/site";

export type OutgoingEmail = {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    /** Makes retries safe: the same key is never delivered twice. */
    idempotencyKey?: string;
};

export type SendResult = { ok: true; provider: string; id: string | null } | { ok: false; provider: string; error: string };

let resend: Resend | null = null;

export function emailFrom() {
    return process.env.EMAIL_FROM || `${siteConfig.name} <bookings@${siteConfig.bookingHost}>`;
}

export function emailProvider(): "resend" | "mailpit" | null {
    if (process.env.RESEND_API_KEY) return "resend";
    if (process.env.MAILPIT_URL) return "mailpit";
    return null;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
    const provider = emailProvider();
    if (provider === "resend") return sendWithResend(email);
    if (provider === "mailpit") return sendToMailpit(email);
    console.warn(`[email] not configured; skipped "${email.subject}" to ${email.to}`);
    return { ok: false, provider: "none", error: "Email isn't configured (set RESEND_API_KEY)." };
}

async function sendWithResend(email: OutgoingEmail): Promise<SendResult> {
    resend ??= new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send(
        { from: emailFrom(), to: email.to, subject: email.subject, html: email.html, text: email.text, replyTo: email.replyTo },
        email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    );
    if (error) return { ok: false, provider: "resend", error: `${error.name}: ${error.message}`.slice(0, 1000) };
    return { ok: true, provider: "resend", id: data?.id ?? null };
}

/** Mailpit's send API (local Supabase stack). */
async function sendToMailpit(email: OutgoingEmail): Promise<SendResult> {
    const from = emailFrom().match(/^(.*)<(.+)>$/);
    const response = await fetch(`${process.env.MAILPIT_URL!.replace(/\/$/, "")}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            From: from ? { Name: from[1].trim(), Email: from[2].trim() } : { Email: emailFrom() },
            To: [{ Email: email.to }],
            ReplyTo: email.replyTo ? [{ Email: email.replyTo }] : undefined,
            Subject: email.subject,
            HTML: email.html,
            Text: email.text,
        }),
    });
    if (!response.ok) return { ok: false, provider: "mailpit", error: `Mailpit ${response.status}` };
    const body = (await response.json().catch(() => ({}))) as { ID?: string };
    return { ok: true, provider: "mailpit", id: body.ID ?? null };
}

export function resetEmailClient() {
    resend = null;
}
