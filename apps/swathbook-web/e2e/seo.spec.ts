import { expect, test, type Page } from "@playwright/test";
import { createBusiness, createUser } from "./support/admin";
import { uniqueSlug } from "./support/data";

/**
 * Search basics every public page must keep: a unique title and description,
 * a canonical URL on the production host, share previews, one h1, alt text,
 * and valid structured data. Private pages must stay out of the index.
 */
const SITE = "https://www.swathbook.com";
const MARKETING = ["/", "/features", "/industries", "/pricing", "/about", "/contact", "/privacy", "/terms"];
const PRIVATE = ["/auth/login", "/auth/signup", "/auth/forgot_password", "/dashboard", "/onboarding"];

type Seo = {
    lang: string | null;
    title: string;
    description: string | null;
    canonicals: string[];
    robots: string | null;
    og: Record<string, string>;
    twitterCard: string | null;
    h1s: string[];
    headingLevels: number[];
    imagesWithoutAlt: string[];
    jsonLd: Array<string | null>;
    emptyLinks: string[];
};

async function readSeo(page: Page): Promise<Seo> {
    return page.evaluate(() => {
        const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content") ?? null;
        const og: Record<string, string> = {};
        for (const node of document.querySelectorAll('meta[property^="og:"]')) og[node.getAttribute("property")!] = node.getAttribute("content") ?? "";
        const visible = (element: Element) => !element.closest("[hidden], [aria-hidden='true'], template");
        return {
            lang: document.documentElement.getAttribute("lang"),
            title: document.title,
            description: meta('meta[name="description"]'),
            canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((link) => link.getAttribute("href") ?? ""),
            robots: meta('meta[name="robots"]'),
            og,
            twitterCard: meta('meta[name="twitter:card"]'),
            h1s: [...document.querySelectorAll("h1")].filter(visible).map((h1) => h1.textContent?.trim() ?? ""),
            headingLevels: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible).map((h) => Number(h.tagName[1])),
            imagesWithoutAlt: [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).map((img) => img.src),
            jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent),
            emptyLinks: [...document.querySelectorAll("a[href]")]
                .filter((a) => visible(a) && !a.textContent?.trim() && !a.getAttribute("aria-label") && !a.querySelector("img[alt]:not([alt=''])"))
                .map((a) => a.getAttribute("href") ?? ""),
        };
    });
}

function expectIndexable(seo: Seo, path: string) {
    expect(seo.lang, "html lang").toBe("en");
    expect(seo.title.length, `title "${seo.title}"`).toBeGreaterThanOrEqual(15);
    expect(seo.title.length, `title "${seo.title}"`).toBeLessThanOrEqual(70);
    expect(seo.description?.length ?? 0, `description "${seo.description}"`).toBeGreaterThanOrEqual(50);
    expect(seo.description?.length ?? 0, `description "${seo.description}"`).toBeLessThanOrEqual(170);
    expect(seo.canonicals, "exactly one canonical, on the production host").toEqual([`${SITE}${path === "/" ? "" : path}`]);
    expect(seo.robots ?? "", "robots meta").not.toMatch(/noindex/);
    expect(seo.og["og:title"], "og:title").toBeTruthy();
    expect(seo.og["og:description"], "og:description").toBeTruthy();
    expect(seo.og["og:image"], "og:image is absolute").toMatch(/^https?:\/\//);
    expect(seo.og["og:url"], "og:url matches the canonical").toBe(seo.canonicals[0]);
    expect(seo.twitterCard).toBe("summary_large_image");
    expect(seo.h1s, "exactly one visible h1").toHaveLength(1);
    expect(seo.imagesWithoutAlt, "images need alt text (empty for decorative)").toEqual([]);
    expect(seo.emptyLinks, "links need text or a label").toEqual([]);
    for (const block of seo.jsonLd) expect(() => JSON.parse(block ?? ""), "JSON-LD parses").not.toThrow();

    // Headings never skip a level going down (h2 straight to h4).
    seo.headingLevels.forEach((level, index) => {
        if (index > 0) expect(level - seo.headingLevels[index - 1], `heading order ${seo.headingLevels.join(",")}`).toBeLessThanOrEqual(1);
    });
}

test.describe("search: marketing pages", () => {
    test("every page has complete, unique metadata", async ({ page }) => {
        const titles = new Map<string, string>();
        const descriptions = new Map<string, string>();
        for (const path of MARKETING) {
            const response = await page.goto(path);
            expect(response?.status(), path).toBe(200);
            const seo = await readSeo(page);
            await test.step(path, () => expectIndexable(seo, path));

            expect(titles.get(seo.title), `"${seo.title}" is also the title of`).toBeUndefined();
            expect(descriptions.get(seo.description!), `description on ${path} is also on`).toBeUndefined();
            titles.set(seo.title, path);
            descriptions.set(seo.description!, path);
        }
    });

    test("the home and pricing pages describe the product and its FAQs", async ({ page }) => {
        for (const path of ["/", "/pricing"]) {
            await page.goto(path);
            const types = (await readSeo(page)).jsonLd.flatMap((block) => [JSON.parse(block!)].flat().map((item: { "@type": string }) => item["@type"]));
            expect(types, path).toEqual(expect.arrayContaining(["SoftwareApplication", "FAQPage"]));
        }
    });
});

test.describe("search: booking pages", () => {
    // The sitemap is cached for hours (cacheLife), so a business created here
    // won't be listed yet; the crawl-rules tests check the sitemap's shape.
    test("a live business page is indexable and local; a paused one is noindex", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const live = await createBusiness(owner.id, { name: "Northside Leaf & Lawn", slug: uniqueSlug("northside") });
        const paused = await createBusiness(owner.id, { name: "Paused Pressure Wash", slug: uniqueSlug("paused"), published: false });

        await page.goto(`/l/${live.slug}`);
        const seo = await readSeo(page);
        expectIndexable(seo, `/l/${live.slug}`);
        const business = seo.jsonLd.flatMap((block) => [JSON.parse(block!)].flat()).find((item) => item["@type"] === "LocalBusiness");
        expect(business).toMatchObject({ name: "Northside Leaf & Lawn", url: `${SITE}/l/${live.slug}` });

        await page.goto(`/l/${paused.slug}`);
        expect((await readSeo(page)).robots).toMatch(/noindex/);
    });
});

test.describe("search: crawl rules", () => {
    test("robots.txt allows the site, blocks the API and points at the sitemap", async ({ request }) => {
        const robots = await (await request.get("/robots.txt")).text();
        expect(robots).toMatch(/User-Agent: \*\s+Allow: \/\s+Disallow: \/api\//);
        expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    });

    test("the sitemap lists every marketing page on the production host", async ({ request }) => {
        const response = await request.get("/sitemap.xml");
        expect(response.headers()["content-type"]).toMatch(/xml/);
        const sitemap = await response.text();
        for (const path of MARKETING) expect(sitemap).toContain(`<loc>${SITE}${path === "/" ? "" : path}</loc>`);
        expect(sitemap).not.toMatch(/localhost|\/dashboard|\/auth\//);
        // Booking pages (when there are any) are listed under /l/ on the production host.
        const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
        for (const loc of locs) expect(loc).toMatch(new RegExp(`^${SITE.replace(/\./g, "\\.")}(/[a-z-]*|/l/[a-z0-9-]+)?$`));
    });

    test("private pages are kept out of search two ways", async ({ request }) => {
        for (const path of PRIVATE) {
            const response = await request.get(path, { maxRedirects: 0 });
            expect(response.headers()["x-robots-tag"], `${path} header`).toBe("noindex, nofollow");
            if (response.status() === 200) expect(await response.text(), `${path} meta`).toMatch(/<meta name="robots" content="noindex/);
        }
    });
});
