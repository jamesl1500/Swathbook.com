import { expect, test, type Page } from "@playwright/test";
import { createBusiness, createUser } from "./support/admin";
import { expectOnPath } from "./support/auth";
import { uniqueId } from "./support/data";

/** Every JSON-LD object on the page, flattened. */
async function structuredData(page: Page) {
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    return blocks.flatMap((block) => {
        const parsed = JSON.parse(block) as object | object[];
        return Array.isArray(parsed) ? parsed : [parsed];
    }) as Array<Record<string, unknown>>;
}

test.describe("business directory", () => {
    test("finds a business by name and opens its booking page", async ({ page }) => {
        const name = `Quillback Lawn ${uniqueId()}`;
        const owner = await createUser();
        const business = await createBusiness(owner.id, { name });

        await page.goto("/businesses");
        await expect(page.getByRole("heading", { level: 1, name: "Find local pros you can book online" })).toBeVisible();
        await page.getByRole("searchbox", { name: "Search businesses" }).fill(name);
        await page.getByRole("button", { name: "Search" }).click();

        await expect(page).toHaveURL(new RegExp(`/businesses\\?q=${encodeURIComponent(name).replace(/%20/g, "\\+")}`));
        await expect(page.getByRole("status").filter({ hasText: "1 business" })).toBeVisible();
        await expect(page.getByRole("searchbox", { name: "Search businesses" })).toHaveValue(name);
        // Search results are never indexed.
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

        await page.getByRole("link", { name }).click();
        await expectOnPath(page, `/l/${business.slug}`);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    });

    test("says when nothing matches", async ({ page }) => {
        await page.goto(`/businesses?q=${uniqueId()}-no-such-business`);
        await expect(page.getByRole("heading", { name: /No matches for/ })).toBeVisible();
        await expect(page.getByRole("link", { name: "See all businesses" })).toBeVisible();
    });

    test("serves an indexable directory page per trade with structured data", async ({ page }) => {
        await page.goto("/businesses/lawn-care");
        await expect(page.getByRole("heading", { level: 1, name: "Lawn mowing services you can book online" })).toBeVisible();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/businesses\/lawn-care$/);
        await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Find a pro");

        const data = await structuredData(page);
        const breadcrumb = data.find((item) => item["@type"] === "BreadcrumbList");
        expect(breadcrumb?.itemListElement).toHaveLength(3);
        expect(data.some((item) => item["@type"] === "FAQPage")).toBe(true);

        // Internal links to every other trade, so crawlers reach the whole directory.
        await expect(page.getByRole("navigation", { name: "Other local services" }).getByRole("link", { name: "Plumbers" })).toHaveAttribute(
            "href",
            "/businesses/plumbing",
        );
    });

    test("searches within a trade without leaving it", async ({ page }) => {
        const name = `Marigold Mowing ${uniqueId()}`;
        const owner = await createUser();
        await createBusiness(owner.id, { name });

        await page.goto("/businesses/lawn-care");
        await page.getByRole("searchbox", { name: "Search lawn mowing services" }).fill(name);
        await page.getByRole("button", { name: "Search" }).click();
        await expect(page).toHaveURL(/\/businesses\/lawn-care\?q=/);
        await expect(page.getByRole("link", { name })).toBeVisible();

        await page.goto(`/businesses/plumbing?q=${encodeURIComponent(name)}`);
        await expect(page.getByRole("heading", { name: /No matches for/ })).toBeVisible();
    });

    // Streaming means the status stays 200 (as for unknown booking links); the page is noindex instead.
    test("shows a not-found page for trades that don't exist", async ({ page }) => {
        await page.goto("/businesses/not-a-trade");
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    });

    test("is in the sitemap and the main navigation", async ({ page, request }) => {
        const sitemap = await (await request.get("/sitemap.xml")).text();
        expect(sitemap).toContain("/businesses</loc>");

        await page.goto("/");
        await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Find a pro" })).toHaveAttribute("href", "/businesses");
        await expect(page.getByRole("contentinfo").getByRole("link", { name: "My bookings" })).toHaveAttribute("href", "/my/jobs");
    });
});
