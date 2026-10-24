import { describe, expect, it } from "vitest";
import { businessJsonLd, metaDescription } from "./seo";

describe("metaDescription", () => {
    it("keeps short text and collapses whitespace", () => {
        expect(metaDescription("  Weekly mowing\n in   Austin. ".replace("\n", "\n"))).toBe("Weekly mowing in Austin.");
    });

    it("cuts long text on a word boundary with an ellipsis", () => {
        const text = "Family-owned lawn care serving Northside since 2014, licensed and insured, with weekly mowing, edging, leaf cleanup, mulch, hedge trimming and seasonal bed cleanups for every yard.";
        const result = metaDescription(text);
        expect(result.length).toBeLessThanOrEqual(160);
        expect(result.endsWith("…")).toBe(true);
        expect(text.startsWith(result.slice(0, -1))).toBe(true);
        expect(result.slice(0, -1)).not.toMatch(/[\s,]$/);
    });
});

describe("businessJsonLd", () => {
    const base = {
        business: { name: "Green Acres", slug: "green-acres", description: null, phone: "512-555-0100", website_url: null, currency: "usd" },
        hours: [{ weekday: 1, opens_at: "08:00:00", closes_at: "17:00:00" }],
        logoUrl: null,
        tradeName: "Lawn mowing",
    };

    it("describes the business, its hours and how to book", () => {
        const data = businessJsonLd({ ...base, services: [] });
        expect(data).toMatchObject({
            "@type": "LocalBusiness",
            name: "Green Acres",
            url: "https://www.swathbook.com/green-acres",
            telephone: "512-555-0100",
            openingHoursSpecification: [{ dayOfWeek: "https://schema.org/Monday", opens: "08:00", closes: "17:00" }],
            potentialAction: { "@type": "ReserveAction", target: { urlTemplate: "https://www.swathbook.com/green-acres" } },
        });
        expect(data).not.toHaveProperty("hasOfferCatalog");
        expect(data).not.toHaveProperty("logo");
    });

    it("prices services by type, leaving quotes unpriced", () => {
        const data = businessJsonLd({
            ...base,
            services: [
                { name: "Mow", description: null, price_type: "fixed", price_cents: 4500 },
                { name: "Cleanup", description: "Leaves", price_type: "starting_at", price_cents: 12000 },
                { name: "Design", description: null, price_type: "quote", price_cents: 0 },
            ],
        });
        const [fixed, from, quote] = data.hasOfferCatalog!.itemListElement;
        expect(fixed).toMatchObject({ price: "45.00", priceCurrency: "USD", itemOffered: { name: "Mow" } });
        expect(from).toMatchObject({ priceSpecification: { minPrice: "120.00", priceCurrency: "USD" }, itemOffered: { description: "Leaves" } });
        expect(quote).not.toHaveProperty("price");
        expect(quote).not.toHaveProperty("priceSpecification");
    });
});
