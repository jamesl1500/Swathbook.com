import { expect, test } from "@playwright/test";
import { admin, createBusiness, createUser } from "./support/admin";
import { uniqueEmail, uniqueSlug } from "./support/data";

test.describe("public booking page", () => {
    test("a customer picks a service and time, books, and lands on their booking page", async ({ page, request }) => {
        const owner = await createUser();
        const business = await createBusiness(owner.id, {
            name: "Northside Leaf & Lawn",
            openEveryDay: true,
            services: [
                { name: "Weekly mow", price_cents: 4500, duration_minutes: 60 },
                { name: "Leaf cleanup", price_cents: 24000, duration_minutes: 120 },
            ],
        });
        const email = uniqueEmail("customer");

        await page.goto(`/l/${business.slug}`);
        await expect(page.getByRole("heading", { level: 1, name: "Northside Leaf & Lawn" })).toBeVisible();
        await expect(page).toHaveTitle("Book Northside Leaf & Lawn online · Lawn mowing");
        // Search engines get the business as structured data.
        const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
        expect(jsonLd).toMatchObject({ "@type": "LocalBusiness", name: "Northside Leaf & Lawn" });
        expect(jsonLd.hasOfferCatalog.itemListElement).toHaveLength(2);

        await page.getByRole("checkbox", { name: /Weekly mow/ }).check();
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page.getByRole("heading", { name: "Pick a time" })).toBeVisible();
        const firstTime = page.getByRole("button", { name: /^\d{1,2}:\d{2} [AP]M$/ }).first();
        await expect(firstTime).toBeVisible();
        const chosenTime = await firstTime.textContent();
        await firstTime.click();
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByLabel("Your name").fill("Pat Customer");
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Street address").fill("10 Oak Ln");
        await page.getByLabel("City").fill("Austin");
        await page.getByLabel("State").fill("TX");
        await page.getByLabel("ZIP").fill("78701");
        await page.getByLabel(/Anything we should know/).fill("Gate code 1234");
        await page.getByRole("button", { name: "Book it" }).click();

        await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible();
        expect(new URL(page.url()).pathname).toMatch(/^\/booking\/[0-9a-f]{64}$/);
        await expect(page.getByText(chosenTime!.trim(), { exact: false }).first()).toBeVisible();

        // Add-to-calendar file
        const ics = await request.get(`${new URL(page.url()).pathname}/calendar`);
        expect(ics.headers()["content-type"]).toContain("text/calendar");
        expect(await ics.text()).toContain("SUMMARY:Northside Leaf & Lawn: Weekly mow");

        // It's a real booking for the owner.
        const { data: booking } = await admin
            .from("bookings")
            .select("status, source, customer_notes, customers(full_name, email)")
            .eq("business_id", business.id)
            .single();
        expect(booking).toMatchObject({ status: "confirmed", source: "booking_page", customer_notes: "Gate code 1234", customers: { full_name: "Pat Customer", email } });
    });

    test("asks for the required details before booking", async ({ page }) => {
        const owner = await createUser();
        const business = await createBusiness(owner.id, { openEveryDay: true });

        await page.goto(`/l/${business.slug}`);
        await page.getByRole("checkbox", { name: /Weekly mow/ }).check();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: /^\d{1,2}:\d{2} [AP]M$/ }).first().click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Book it" }).click();

        await expect(page.getByText("Enter your name.")).toBeVisible();
        await expect(page.getByText("Enter a valid email.")).toBeVisible();
        await expect(page.getByText("Enter the service address.")).toBeVisible();
    });

    // With partial prerendering the shell streams before the lookup finishes, so
    // the status stays 200; Next marks the page noindex instead.
    test("an unknown link shows a not-found page", async ({ page }) => {
        await page.goto(`/l/${uniqueSlug("nobody")}`);
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    });

    test("booking links live under /l/, never at the site root", async ({ page }) => {
        const owner = await createUser();
        const business = await createBusiness(owner.id, { name: "Root Probe Cleaning" });
        await page.goto(`/${business.slug}`);
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await page.goto(`/l/${business.slug}`);
        await expect(page.getByRole("heading", { level: 1, name: "Root Probe Cleaning" })).toBeVisible();
    });

    test("a paused business says it isn't taking bookings", async ({ page }) => {
        const owner = await createUser();
        const business = await createBusiness(owner.id, { name: "Paused Pools", published: false });
        await page.goto(`/l/${business.slug}`);
        await expect(page.getByRole("heading", { name: "Paused Pools isn't taking online bookings right now" })).toBeVisible();
    });

    test("a made-up customer booking link shows a not-found page", async ({ page }) => {
        await page.goto(`/booking/${"0".repeat(64)}`);
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    });
});
