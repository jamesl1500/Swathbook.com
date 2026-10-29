"use client";

import { Download, ExternalLink, Mail, MessageSquareText, Share2 } from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";
import { Card, CardTitle } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { brandTextColor } from "@/libs/utils";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function ShareTools({
  url,
  displayUrl,
  businessName,
  qrSvg,
  qrPng,
  brandColor,
}: {
  url: string;
  displayUrl: string;
  businessName: string;
  /** Generated server-side by the qrcode library from our own URL. */
  qrSvg: string;
  qrPng: string;
  brandColor: string;
}) {
  const message = `Book with ${businessName} online: ${url}`;
  const shares = [
    { label: "Text message", href: `sms:?&body=${encodeURIComponent(message)}`, icon: MessageSquareText },
    {
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent(`Book ${businessName} online`)}&body=${encodeURIComponent(message)}`,
      icon: Mail,
    },
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(message)}`, icon: Share2 },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, icon: Share2 },
    {
      label: "X",
      href: `https://x.com/intent/post?text=${encodeURIComponent(`Book with ${businessName} online`)}&url=${encodeURIComponent(url)}`,
      icon: Share2,
    },
  ];
  const embed = `<a href="${url}" style="display:inline-block;background:${brandColor};color:${brandTextColor(brandColor)};padding:12px 22px;border-radius:999px;font-family:system-ui,sans-serif;font-weight:600;text-decoration:none">Book with ${escapeHtml(businessName)}</a>`;
  const fileBase = displayUrl.split("/").pop() || "booking";

  return (
    <>
      <Card>
        <CardTitle>Share your link</CardTitle>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-paper p-3">
          <span className="min-w-0 basis-full break-all px-2 font-mono text-sm font-semibold sm:flex-1 sm:basis-auto sm:truncate" data-testid="share-url">
            {displayUrl}
          </span>
          <CopyButton value={url} variant="primary" />
          <a href={url} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <ExternalLink className="size-4" aria-hidden="true" />
            Open
          </a>
        </div>

        <p className="label-tag mt-6 text-ink-faint">Send it</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {shares.map(({ label, href, icon: Icon }) => (
            <li key={label}>
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm font-semibold text-ink-soft hover:border-ink-faint hover:text-ink"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>QR code</CardTitle>
        <div className="flex flex-wrap items-center gap-6">
          <div
            className="size-44 shrink-0 rounded-2xl border border-line bg-white p-2"
            role="img"
            aria-label={`QR code for ${displayUrl}`}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm text-ink-soft">
              Print it on business cards, flyers, invoices and your truck or van. Phones open your booking page straight from the camera.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={qrPng} download={`${fileBase}-qr.png`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <Download className="size-4" aria-hidden="true" />
                PNG (print)
              </a>
              <a
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
                download={`${fileBase}-qr.svg`}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                <Download className="size-4" aria-hidden="true" />
                SVG (signs)
              </a>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>&ldquo;Book now&rdquo; button for your website</CardTitle>
        <p className="text-sm text-ink-soft">Paste this into your website builder (Wix, Squarespace, WordPress) to add a booking button.</p>
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-paper p-4">
          <span
            className="inline-block rounded-full px-5 py-3 text-sm font-semibold"
            style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
          >
            Book with {businessName}
          </span>
        </div>
        <pre className="mt-3 whitespace-pre-wrap break-all rounded-xl bg-ink p-4 text-xs leading-relaxed text-paper/90">
          <code>{embed}</code>
        </pre>
        <div className="mt-3">
          <CopyButton value={embed} label="Copy button code" />
        </div>
      </Card>
    </>
  );
}
