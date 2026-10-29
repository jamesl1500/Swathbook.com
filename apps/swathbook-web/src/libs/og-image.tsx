/**
 * og-image.tsx
 *
 * Branded 1200×630 share card used for Open Graph and Twitter previews.
 *
 * @module src/libs/og-image
 * @since 1.0.0
 */

import { ImageResponse } from "next/og";
import { siteConfig } from "./globals/site";
import { brandOnLight, brandTextColor } from "./utils";

export const ogSize = { width: 1200, height: 630 };
export const ogAlt = `${siteConfig.name}: ${siteConfig.tagline}`;

export function renderOgImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "72px 80px",
                    color: "#f6f3ee",
                    backgroundColor: "#1c3d70",
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.07) 2px, transparent 2px)",
                    backgroundSize: "60px 60px",
                    position: "relative",
                }}
            >
                <svg width="300" height="360" viewBox="0 0 10 12" style={{ position: "absolute", right: 70, top: 60 }}>
                    <path d="M5 0a5 5 0 0 1 5 5c0 3.6-5 7-5 7s-5-3.4-5-7a5 5 0 0 1 5-5Z" fill="#ff7a33" />
                    <circle cx="5" cy="5" r="1.9" fill="#1c3d70" />
                </svg>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <svg width="56" height="56" viewBox="0 0 32 32">
                        <rect width="32" height="32" rx="9" fill="#f6f3ee" />
                        <path d="M7.5 24.5c3.5 0 4-6 8-6s4.5-5.5 8-5.5" fill="none" stroke="#2b5290" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 4.2" />
                        <circle cx="7.5" cy="24.5" r="2.4" fill="#1c3d70" />
                        <path d="M23.5 4.5a5 5 0 0 1 5 5c0 3.6-5 8.5-5 8.5s-5-4.9-5-8.5a5 5 0 0 1 5-5Z" fill="#ff7a33" />
                        <circle cx="23.5" cy="9.5" r="1.8" fill="#f6f3ee" />
                    </svg>
                    <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{siteConfig.name}</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, display: "flex", flexDirection: "column" }}>
                        <span>Book the job.</span>
                        <span>Get paid.</span>
                        <span style={{ color: "#ff7a33" }}>Drive less.</span>
                    </div>
                    <div style={{ marginTop: 28, fontSize: 30, color: "rgba(247, 242, 232, 0.85)", maxWidth: 900 }}>
                        Booking, deposits, payments and AI-planned routes for detailers, landscapers, cleaners, plumbers and every trade on the road.
                    </div>
                </div>
            </div>
        ),
        ogSize,
    );
}

/** Share card for one business's booking page. */
export function renderBusinessOgImage({
    name,
    tradeName,
    slug,
    brandColor,
    logoUrl,
}: {
    name: string;
    tradeName?: string;
    slug: string;
    brandColor: string;
    logoUrl: string | null;
}) {
    const text = brandTextColor(brandColor);
    const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("");
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "72px 80px",
                    color: text,
                    backgroundColor: brandColor,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                    <div
                        style={{
                            width: 132,
                            height: 132,
                            borderRadius: 32,
                            backgroundColor: "#ffffff",
                            color: brandOnLight(brandColor),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 56,
                            fontWeight: 800,
                            overflow: "hidden",
                        }}
                    >
                        {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser
                            <img src={logoUrl} alt="" width={132} height={132} style={{ objectFit: "cover" }} />
                        ) : (
                            initials
                        )}
                    </div>
                    {tradeName ? <div style={{ fontSize: 32, opacity: 0.85 }}>{tradeName}</div> : null}
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: name.length > 28 ? 72 : 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>{name}</div>
                    <div style={{ marginTop: 24, fontSize: 36, opacity: 0.9 }}>{`Book online · ${siteConfig.bookingLinkPrefix}${slug}`}</div>
                </div>
            </div>
        ),
        ogSize,
    );
}
