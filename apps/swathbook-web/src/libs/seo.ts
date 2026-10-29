/**
 * seo.ts
 *
 * Metadata and structured-data helpers so every page ships a canonical URL,
 * Open Graph and Twitter tags that point at itself.
 *
 * @module src/libs/seo
 * @since 1.0.0
 */

import type { Metadata } from "next";
import { siteConfig } from "./globals/site";
import { businessPagePath } from "./routes";
import { faqs, pricingTiers } from "./marketing/content";

export const ogImage = {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: `${siteConfig.name}: ${siteConfig.tagline}`,
};

/**
 * Metadata for an indexable marketing page.
 */
export function pageMetadata({
    title,
    description,
    path,
}: {
    title: string;
    description: string;
    path: string;
}): Metadata {
    const fullTitle = `${title} · ${siteConfig.name}`;
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            type: "website",
            locale: "en_US",
            siteName: siteConfig.name,
            url: path,
            title: fullTitle,
            description,
            images: [ogImage],
        },
        twitter: {
            card: "summary_large_image",
            title: fullTitle,
            description,
            images: [ogImage.url],
        },
    };
}

/** For signed-in and auth screens: keep them out of search results. */
export const noIndex: Metadata["robots"] = { index: false, follow: false };

const organizationId = `${siteConfig.url}/#organization`;

export const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    url: siteConfig.url,
    logo: `${siteConfig.url}/icon.svg`,
    email: siteConfig.supportEmail,
};

export const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    publisher: { "@id": organizationId },
};

export const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: siteConfig.description,
    url: siteConfig.url,
    publisher: { "@id": organizationId },
    // Derived from the pricing table so the two never drift apart.
    offers: pricingTiers
        .filter((tier) => tier.price.startsWith("$"))
        .map((tier) => ({
            "@type": "Offer",
            name: tier.name,
            price: tier.price.replace(/[^0-9.]/g, ""),
            priceCurrency: "USD",
            description: tier.description,
        })),
};

export function faqJsonLd(items: Array<{ question: string; answer: string }> = faqs) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
    };
}

/** Trims to `max` characters on a word boundary, for meta descriptions. */
export function metaDescription(text: string, max = 160) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

const SCHEMA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type JsonLdBusiness = {
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    website_url: string | null;
    currency: string;
    service_area?: string | null;
};

type JsonLdService = {
    name: string;
    description: string | null;
    price_type: "fixed" | "starting_at" | "quote";
    price_cents: number;
};

/**
 * schema.org LocalBusiness for a public booking page: services as an offer
 * catalog, opening hours, and a ReserveAction pointing at the page itself.
 */
export function businessJsonLd({
    business,
    services,
    hours,
    logoUrl,
    tradeName,
    imageUrls = [],
}: {
    business: JsonLdBusiness;
    services: JsonLdService[];
    hours: Array<{ weekday: number; opens_at: string; closes_at: string }>;
    logoUrl: string | null;
    tradeName?: string;
    /** Cover and gallery photos, best first. */
    imageUrls?: string[];
}) {
    const url = `${siteConfig.url}${businessPagePath(business.slug)}`;
    const currency = business.currency.toUpperCase();
    return {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": `${url}#business`,
        name: business.name,
        url,
        ...(business.description ? { description: business.description } : {}),
        ...(business.phone ? { telephone: business.phone } : {}),
        ...(logoUrl ? { logo: logoUrl } : {}),
        ...(imageUrls.length || logoUrl ? { image: imageUrls.length ? imageUrls : logoUrl } : {}),
        ...(business.service_area ? { areaServed: business.service_area } : {}),
        ...priceRange(services, currency),
        ...(business.website_url ? { sameAs: [business.website_url] } : {}),
        ...(tradeName ? { knowsAbout: tradeName } : {}),
        ...(hours.length
            ? {
                  openingHoursSpecification: hours.map((hour) => ({
                      "@type": "OpeningHoursSpecification",
                      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[hour.weekday]}`,
                      opens: hour.opens_at.slice(0, 5),
                      closes: hour.closes_at.slice(0, 5),
                  })),
              }
            : {}),
        ...(services.length
            ? {
                  hasOfferCatalog: {
                      "@type": "OfferCatalog",
                      name: `${business.name} services`,
                      itemListElement: services.map((service) => ({
                          "@type": "Offer",
                          itemOffered: {
                              "@type": "Service",
                              name: service.name,
                              ...(service.description ? { description: service.description } : {}),
                          },
                          ...servicePrice(service, currency),
                      })),
                  },
              }
            : {}),
        potentialAction: {
            "@type": "ReserveAction",
            target: { "@type": "EntryPoint", urlTemplate: url, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] },
            result: { "@type": "Reservation", name: `${business.name} booking` },
        },
    };
}

function servicePrice(service: JsonLdService, currency: string) {
    const price = (service.price_cents / 100).toFixed(2);
    if (service.price_type === "fixed") return { price, priceCurrency: currency };
    if (service.price_type === "starting_at") {
        return { priceSpecification: { "@type": "PriceSpecification", minPrice: price, priceCurrency: currency } };
    }
    return {}; // Priced by quote: no number to publish.
}

function priceRange(services: JsonLdService[], currency: string) {
    const prices = services.filter((service) => service.price_type !== "quote" && service.price_cents > 0).map((service) => service.price_cents);
    if (!prices.length) return {};
    const format = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    return { priceRange: low === high ? format(low) : `${format(low)}–${format(high)}` };
}

/** "Austin, Round Rock & Cedar Park, TX" -> "Austin, TX": the first place, plus a trailing state code. */
export function shortArea(area: string) {
    const parts = area.split(/\s*(?:,|&|\band\b|\/|;)\s*/i).filter(Boolean);
    const first = parts[0] ?? area;
    const state = parts.length > 1 && /^[A-Z]{2}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : null;
    return state && state !== first ? `${first}, ${state}` : first;
}

/**
 * A booking page's search snippet. Local searches usually name a place, so the
 * service area goes in the title and description when the business set one.
 */
export function businessPageMeta({
    business,
    services,
    tradeName,
}: {
    business: { name: string; description: string | null; service_area?: string | null };
    services: Array<{ name: string }>;
    tradeName?: string;
}) {
    const area = business.service_area?.trim() || null;
    const title = `Book ${business.name} online`;
    // Lead with what people search for (name, trade, town) and stay near the ~60
    // characters Google shows; "Book online" only when it still fits.
    const place = area ? shortArea(area) : null;
    const core = [business.name, tradeName && place ? `${tradeName} in ${place}` : tradeName ?? (place ? `Serving ${place}` : null)]
        .filter(Boolean)
        .join(" · ");
    const fullTitle = `${core} | Book online`.length <= 65 ? `${core} | Book online` : core;
    const serviceNames = services.slice(0, 3).map((service) => service.name.toLowerCase());
    const intro = business.description?.trim()
        ? business.description.trim()
        : `${business.name}${tradeName ? `, ${tradeName.toLowerCase()}` : ""}: ${serviceNames.length ? `${serviceNames.join(", ")} and more.` : ""}`;
    const mentionsArea = area && intro.toLowerCase().includes(area.toLowerCase());
    const description = metaDescription(
        [intro.replace(/[.\s]*$/, "."), area && !mentionsArea ? `Serving ${area}.` : null, "See prices, pick a time and book online."].filter(Boolean).join(" "),
    );
    return { title, fullTitle, description, area };
}
