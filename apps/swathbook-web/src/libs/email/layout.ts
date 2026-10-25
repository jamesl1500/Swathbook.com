/**
 * layout.ts
 *
 * The one email layout: a business-branded header, a short message, a details
 * table and a button. Table-based, inline-styled HTML that renders in every
 * mail client, plus a plain-text twin.
 *
 * @module src/libs/email/layout
 * @since 1.0.0
 */

import { siteConfig } from "@/libs/globals/site";
import { brandTextColor } from "@/libs/utils";

export type EmailContent = {
    /** Shown in the inbox list after the subject. */
    preheader: string;
    /** Who the email is from, as shown in the header (a business or Swathbook). */
    sender: { name: string; color?: string | null };
    heading: string;
    paragraphs: string[];
    details?: Array<{ label: string; value: string }>;
    button?: { label: string; url: string };
    secondaryLink?: { label: string; url: string };
    footer?: string;
};

const INK = "#14202e";
const SOFT = "#475466";
const FAINT = "#566273";
const PAPER = "#f6f3ee";
const CARD = "#fffdfa";
const LINE = "#ddd6ca";

export function escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
    const brand = /^#[0-9a-f]{6}$/i.test(content.sender.color ?? "") ? content.sender.color! : "#1c3d70";
    const onBrand = brandTextColor(brand);
    const e = escapeHtml;

    const details = content.details?.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;">
${content.details
    .map(
        (row, index) => `<tr><td style="padding:12px 16px;${index ? `border-top:1px solid ${LINE};` : ""}font-size:14px;color:${FAINT};width:34%;vertical-align:top;">${e(row.label)}</td><td style="padding:12px 16px;${index ? `border-top:1px solid ${LINE};` : ""}font-size:15px;color:${INK};font-weight:600;vertical-align:top;">${e(row.value)}</td></tr>`,
    )
    .join("\n")}
</table>`
        : "";

    const button = content.button
        ? `<p style="margin:0 0 20px;"><a href="${e(content.button.url)}" style="display:inline-block;background:${brand};color:${onBrand};text-decoration:none;font-weight:700;font-size:16px;padding:14px 26px;border-radius:999px;">${e(content.button.label)}</a></p>`
        : "";
    const secondary = content.secondaryLink
        ? `<p style="margin:0 0 20px;font-size:14px;"><a href="${e(content.secondaryLink.url)}" style="color:${INK};font-weight:600;">${e(content.secondaryLink.label)}</a></p>`
        : "";

    const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${e(content.heading)}</title></head>
  <body style="margin:0;padding:0;background:${PAPER};font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${e(content.preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:${CARD};border:1px solid ${LINE};border-radius:20px;overflow:hidden;">
          <tr><td style="background:${brand};color:${onBrand};padding:18px 28px;font-size:18px;font-weight:700;">${e(content.sender.name)}</td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:${INK};">${e(content.heading)}</h1>
            ${content.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${SOFT};">${e(p)}</p>`).join("\n            ")}
            ${details}
            ${button}
            ${secondary}
            ${content.footer ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:${FAINT};">${e(content.footer)}</p>` : ""}
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:${FAINT};">Sent with ${e(siteConfig.name)} · ${e(siteConfig.bookingHost)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

    const text = [
        content.sender.name,
        "",
        content.heading,
        "",
        ...content.paragraphs.flatMap((p) => [p, ""]),
        ...(content.details?.map((row) => `${row.label}: ${row.value}`) ?? []),
        ...(content.details?.length ? [""] : []),
        ...(content.button ? [`${content.button.label}: ${content.button.url}`, ""] : []),
        ...(content.secondaryLink ? [`${content.secondaryLink.label}: ${content.secondaryLink.url}`, ""] : []),
        ...(content.footer ? [content.footer, ""] : []),
        `Sent with ${siteConfig.name}`,
    ].join("\n");

    return { html, text };
}
