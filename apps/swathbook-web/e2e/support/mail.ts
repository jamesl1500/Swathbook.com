/**
 * Reads auth emails from the local Mailpit inbox.
 */
import { expect } from "@playwright/test";
import { env } from "./env";

type MailpitSummary = { ID: string; Subject: string; Created: string };

async function listMessages(email: string): Promise<MailpitSummary[]> {
    const response = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await response.json()) as { messages: MailpitSummary[] };
    return body.messages;
}

export async function countEmails(email: string) {
    return (await listMessages(email)).length;
}

/**
 * Waits for the newest email to `email` whose subject matches, and returns its
 * /auth/confirm link pointed at the app under test. (The email templates use
 * the Supabase site URL, which can differ from the E2E server's port.)
 */
export async function getAuthLink(email: string, subject: RegExp, { minCount = 1 } = {}) {
    let message: MailpitSummary | undefined;
    await expect
        .poll(
            async () => {
                const matching = (await listMessages(email)).filter((item) => subject.test(item.Subject));
                message = matching[0];
                return matching.length;
            },
            { message: `waiting for "${subject}" email to ${email}`, timeout: 20_000 },
        )
        .toBeGreaterThanOrEqual(minCount);

    const detail = (await (await fetch(`${env.mailpitUrl}/api/v1/message/${message!.ID}`)).json()) as { HTML: string };
    const href = detail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
    if (!href) throw new Error(`No /auth/confirm link in "${message!.Subject}"`);

    const link = new URL(href.replaceAll("&amp;", "&"));
    const app = new URL(env.baseURL);
    link.protocol = app.protocol;
    link.host = app.host;
    return link.toString();
}
