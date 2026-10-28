import { describe, expect, it } from "vitest";
import { businessJsonLd, businessPageMeta, metaDescription, shortArea } from "./seo";

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
            url: "https://www.swathbook.com/l/green-acres",
            telephone: "512-555-0100",
            openingHoursSpecification: [{ dayOfWeek: "https://schema.org/Monday", opens: "08:00", closes: "17:00" }],
            potentialAction: { "@type": "ReserveAction", target: { urlTemplate: "https://www.swathbook.com/l/green-acres" } },
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

describe("businessPageMeta", () => {
    const services = [{ name: "Full interior detail" }, { name: "Ceramic coating" }];

    it("puts the trade and area in the title for local searches", () => {
        const meta = businessPageMeta({
            business: { name: "Shine On", description: "Mobile detailing at your driveway.", service_area: "Austin, TX" },
            services,
            tradeName: "Mobile detailing",
        });
        expect(meta.fullTitle).toBe("Shine On · Mobile detailing in Austin, TX | Book online");
        expect(meta.description).toBe("Mobile detailing at your driveway. Serving Austin, TX. See prices, pick a time and book online.");
    });

    it("doesn't repeat an area the description already names", () => {
        const meta = businessPageMeta({ business: { name: "Shine On", description: "Detailing across Austin, TX.", service_area: "Austin, TX" }, services });
        expect(meta.description).toBe("Detailing across Austin, TX. See prices, pick a time and book online.");
        expect(meta.fullTitle).toBe("Shine On · Serving Austin, TX | Book online");
    });

    it("writes a description from the services when there isn't one", () => {
        const meta = businessPageMeta({ business: { name: "Shine On", description: null }, services, tradeName: "Mobile detailing" });
        expect(meta.fullTitle).toBe("Shine On · Mobile detailing | Book online");
        expect(meta.description).toBe("Shine On, mobile detailing: full interior detail, ceramic coating and more. See prices, pick a time and book online.");
    });
});

describe("businessJsonLd for local search", () => {
    it("adds the area served, a price range and photos", () => {
        const data = businessJsonLd({
            business: { name: "Shine On", slug: "shine-on", description: null, phone: null, website_url: null, currency: "usd", service_area: "Austin, TX" },
            services: [
                { name: "Wash", description: null, price_type: "fixed", price_cents: 7500 },
                { name: "Coating", description: null, price_type: "starting_at", price_cents: 65000 },
                { name: "Fleet", description: null, price_type: "quote", price_cents: 0 },
            ],
            hours: [],
            logoUrl: "https://cdn.test/logo.png",
            imageUrls: ["https://cdn.test/cover.jpg", "https://cdn.test/p1.jpg"],
        });
        expect(data).toMatchObject({
            areaServed: "Austin, TX",
            priceRange: "$75–$650",
            logo: "https://cdn.test/logo.png",
            image: ["https://cdn.test/cover.jpg", "https://cdn.test/p1.jpg"],
        });
    });
});

describe("shortArea", () => {
    it("keeps titles short: the first place and the state", () => {
        expect(shortArea("Austin, Round Rock & Cedar Park, TX")).toBe("Austin, TX");
        expect(shortArea("North Dallas and Plano")).toBe("North Dallas");
        expect(shortArea("Boise, ID")).toBe("Boise, ID");
        expect(shortArea("Greater Seattle")).toBe("Greater Seattle");
    });

    it("drops \"Book online\" rather than run long", () => {
        const meta = businessPageMeta({
            business: { name: "Northside Premium Mobile Detailing", description: null, service_area: "Cedar Park, Round Rock, TX" },
            services: [],
            tradeName: "Mobile detailing",
        });
        expect(meta.fullTitle).toBe("Northside Premium Mobile Detailing · Mobile detailing in Cedar Park, TX");
    });
});
