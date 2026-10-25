import { expect, test, type Page } from "@playwright/test";
import { addCrewMember, addJob, admin, createBusiness, createUser, memberIdFor } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { uniqueEmail, uniqueSlug } from "./support/data";
import { tomorrowAt } from "./support/time";

async function ownerWithBusiness(page: Page, options: Parameters<typeof createBusiness>[1] = {}) {
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, options);
    await logIn(page, owner.email, owner.password);
    await expectOnPath(page, "/dashboard");
    return { owner, business };
}

test.describe("services", () => {
    test("add a service with a deposit, edit it, and remove it", async ({ page }) => {
        await ownerWithBusiness(page);
        page.on("dialog", (dialog) => dialog.accept());
        await page.goto("/dashboard/services");

        await page.getByLabel("Name").fill("Hedge trimming");
        await page.getByLabel("Price").fill("65");
        await page.getByText("Percent", { exact: true }).click();
        await page.getByLabel("Deposit percentage").selectOption("25");
        await page.getByRole("button", { name: "Add service" }).click();

        const row = page.getByTestId("service-row").filter({ hasText: "Hedge trimming" });
        await expect(row).toContainText("$65");
        await expect(row).toContainText("25% deposit");

        await row.getByRole("button", { name: "Edit Hedge trimming" }).click();
        // While editing, the name lives in an input, so find the row by its form.
        const editor = page.getByTestId("service-row").filter({ has: page.getByRole("button", { name: "Save changes" }) });
        await editor.getByLabel("Price").fill("70");
        await editor.getByRole("button", { name: "Save changes" }).click();
        await expect(page.getByTestId("service-row").filter({ hasText: "Hedge trimming" })).toContainText("$70");

        await page.getByRole("button", { name: "Delete Hedge trimming" }).click();
        await expect(page.getByTestId("service-row").filter({ hasText: "Hedge trimming" })).toHaveCount(0);
    });
});

test.describe("booking link", () => {
    test("customize the page and link, share it, and pause bookings", async ({ page }) => {
        const { business } = await ownerWithBusiness(page, { name: "Shine On Detail" });
        const newSlug = uniqueSlug("shine");
        await page.goto("/dashboard/link");

        await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
        await expect(page.getByTestId("share-url")).toHaveText(`swathbook.com/l/${business.slug}`);

        await page.getByLabel("About your business").fill("Mobile detailing that comes to your driveway.");
        await page.getByLabel("Booking link").fill(newSlug);
        await page.getByRole("button", { name: "Save booking page" }).click();
        await expect(page.getByText(/Your link changed/)).toBeVisible();
        await expect(page.getByTestId("share-url")).toHaveText(`swathbook.com/l/${newSlug}`);

        await page.goto(`/l/${newSlug}`);
        await expect(page.getByText("Mobile detailing that comes to your driveway.")).toBeVisible();

        await page.goto("/dashboard/link");
        await page.getByRole("switch", { name: "Taking bookings" }).click();
        await expect(page.getByRole("switch", { name: "Bookings paused" })).toBeVisible();
        await page.goto(`/l/${newSlug}`);
        await expect(page.getByRole("heading", { name: /isn't taking online bookings/ })).toBeVisible();
    });

    test("pick a brand color, add a cover photo and a gallery, and see them on the page", async ({ page }) => {
        const { business } = await ownerWithBusiness(page, { name: "Shine On Detail" });
        await page.goto("/dashboard/link");

        // Brand color: a swatch, saved with the page details.
        await page.getByRole("radio", { name: "Teal" }).click();
        await expect(page.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
        await page.getByRole("button", { name: "Save booking page" }).click();
        await expect(page.getByText("Booking page saved.")).toBeVisible();
        const { data: saved } = await admin.from("businesses").select("brand_color").eq("id", business.id).single();
        expect(saved?.brand_color).toBe("#0e7c86");

        // Phone-sized photos are resized in the browser before upload.
        const photo = (label: string) => makeJpeg(page, label);
        await page.locator("#cover-upload").setInputFiles({ name: "van.jpg", mimeType: "image/jpeg", buffer: await photo("Cover") });
        await expect(page.getByText("Cover photo updated.")).toBeVisible();
        await expect(page.getByTestId("cover-preview").getByRole("img")).toBeVisible();

        await page.locator("#photos-upload").setInputFiles([
            { name: "before.jpg", mimeType: "image/jpeg", buffer: await photo("Before") },
            { name: "after.jpg", mimeType: "image/jpeg", buffer: await photo("After") },
        ]);
        await expect(page.getByText("2 photos added.")).toBeVisible();
        await expect(page.getByTestId("photo-tile")).toHaveCount(2);
        await page.getByLabel("Caption for photo 1").fill("Before the wash");
        await page.getByLabel("Caption for photo 1").blur();
        await expect(page.getByText("Caption saved.")).toBeVisible();

        const { data: stored } = await admin.from("business_photos").select("storage_path, caption").eq("business_id", business.id).order("sort_order");
        expect(stored).toHaveLength(2);
        expect(stored![0].storage_path).toMatch(new RegExp(`^${business.id}/photos/.+\\.(webp|jpg)$`));

        // The public page shows the cover and the gallery, and photos open full screen.
        await page.goto(`/l/${business.slug}`);
        await expect(page.getByRole("heading", { name: "Our work" })).toBeVisible();
        await page.getByRole("button", { name: /Before the wash/ }).click();
        const viewer = page.getByRole("dialog", { name: "Shine On Detail photos" });
        await expect(viewer.getByText("Before the wash · 1 of 2")).toBeVisible();
        await viewer.getByRole("button", { name: "Next photo" }).click();
        await expect(viewer.getByText("2 of 2")).toBeVisible();
        await viewer.getByRole("button", { name: "Close" }).click();
        await expect(viewer).toBeHidden();

        // Removing a photo takes it off the page.
        await page.goto("/dashboard/link");
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "Remove photo 2" }).click();
        await expect(page.getByTestId("photo-tile")).toHaveCount(1);
    });

    test("a link someone else has is rejected", async ({ page }) => {
        const rival = await createUser();
        const taken = await createBusiness(rival.id, { slug: uniqueSlug("taken") });
        await ownerWithBusiness(page);
        await page.goto("/dashboard/link");
        await page.getByLabel("Booking link").fill(taken.slug);
        await page.getByRole("button", { name: "Save booking page" }).click();
        await expect(page.getByText("Someone already has that link. Try another.")).toBeVisible();
    });
});

test.describe("customers", () => {
    test("add a customer with an address, find them, and see their page", async ({ page }) => {
        await ownerWithBusiness(page);
        const email = uniqueEmail("ada");
        await page.goto("/dashboard/customers");
        await page.getByRole("link", { name: "Add customer" }).click();

        await page.getByLabel("Name").fill("Ada Lovelace");
        await page.getByLabel("Email", { exact: true }).fill(email);
        await page.getByLabel("Phone").fill("512-555-0101");
        await page.getByLabel("Tags").fill("weekly, corner lot");
        await page.getByLabel("Street address").fill("1 Loop St");
        await page.getByLabel("City").fill("Austin");
        await page.getByRole("button", { name: "Add customer" }).click();

        await expect(page.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeVisible();
        await expect(page.getByText("1 Loop St, Austin")).toBeVisible();
        await expect(page.getByText("corner lot", { exact: true })).toBeVisible();

        await page.goto("/dashboard/customers?q=lovelace");
        await expect(page.getByTestId("customer-row")).toHaveCount(1);
        await page.goto("/dashboard/customers?q=nobody-matches");
        await expect(page.getByText(/No customers match/)).toBeVisible();
    });
});

test.describe("schedule", () => {
    test("create a job by hand, then start and complete it", async ({ page }) => {
        const { business } = await ownerWithBusiness(page);
        const { data: customer } = await admin
            .from("customers")
            .insert({ business_id: business.id, full_name: "Walk-in Wanda", email: uniqueEmail("wanda") })
            .select("id")
            .single();
        await admin.from("customer_addresses").insert({ business_id: business.id, customer_id: customer!.id, line1: "5 Pine Ct", is_primary: true });
        const { date } = tomorrowAt(10);

        await page.goto(`/dashboard/schedule/new?customer=${customer!.id}&date=${date}`);
        await expect(page.getByText("Walk-in Wanda")).toBeVisible();
        await page.getByRole("checkbox", { name: /Weekly mow/ }).check();
        await page.getByLabel("Start time").fill("10:00");
        await page.getByRole("button", { name: "Create job" }).click();

        await expect(page.getByRole("heading", { level: 1, name: "Walk-in Wanda" })).toBeVisible();
        await expect(page.getByText("Confirmed").first()).toBeVisible();

        await page.getByRole("button", { name: "Start job" }).click();
        await expect(page.getByText("In progress").first()).toBeVisible();
        await page.getByRole("button", { name: "Mark complete" }).click();
        await expect(page.getByText("Completed").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Start job" })).toHaveCount(0);

        await page.goto(`/dashboard/schedule?week=${date}`);
        await expect(page.getByTestId("calendar-job").filter({ hasText: "Walk-in Wanda" })).toBeVisible();
    });

    test("overlapping jobs sit side by side on the hour lines", async ({ page }) => {
        const { owner, business } = await ownerWithBusiness(page);
        const memberId = await memberIdFor(business.id, owner.id);
        const crew = await addCrewMember(business.id);
        const nine = tomorrowAt(9);
        await addJob(business.id, { start: nine.at, memberId, customerName: "Nine Sharp", lat: 30.2, lng: -97.7 });
        await addJob(business.id, { start: new Date(nine.at.getTime() + 30 * 60_000), memberId: crew.memberId, customerName: "Half Past", lat: 30.2, lng: -97.7 });

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`/dashboard/schedule?week=${nine.date}`);
        const firstJob = page.getByTestId("calendar-job").filter({ hasText: "Nine Sharp" });
        const secondJob = page.getByTestId("calendar-job").filter({ hasText: "Half Past" });
        await expect(firstJob).toBeVisible();
        await expect(secondJob).toBeVisible();
        const first = await firstJob.boundingBox();
        const second = await secondJob.boundingBox();
        // Side by side, not stacked...
        expect(second!.x).toBeGreaterThanOrEqual(first!.x + first!.width);
        // ...and the half-hour job starts half an hour (28px at 56px/hour) lower.
        expect(Math.round(second!.y - first!.y)).toBe(28);
    });

    test("set weekly hours and add time off", async ({ page }) => {
        await ownerWithBusiness(page);
        await page.goto("/dashboard/schedule/availability");

        await page.getByLabel("Saturday", { exact: true }).check();
        await page.getByLabel("Saturday opens").fill("09:00");
        await page.getByLabel("Saturday closes").fill("13:00");
        await page.getByRole("button", { name: "Save hours" }).click();
        await expect(page.getByText("Hours saved.")).toBeVisible();

        await page.getByLabel(/Reason/).fill("Family reunion");
        await page.getByRole("button", { name: "Add time off" }).click();
        await expect(page.getByText("Family reunion")).toBeVisible();
    });
});

test.describe("routes", () => {
    test("plan tomorrow's route and see the stops in driving order", async ({ page }) => {
        const { owner, business } = await ownerWithBusiness(page);
        const memberId = await memberIdFor(business.id, owner.id);
        // Booked south → north → east around the shop, criss-crossing town. With a
        // ±2 hour arrival window the only late-free, shortest order is south → east → north.
        await admin.from("businesses").update({ arrival_window_minutes: 120 }).eq("id", business.id);
        await addJob(business.id, { start: tomorrowAt(9).at, memberId, customerName: "South Side", lat: 30.2, lng: -97.7431 });
        await addJob(business.id, { start: tomorrowAt(11).at, memberId, customerName: "North Side", lat: 30.33, lng: -97.7431 });
        await addJob(business.id, { start: tomorrowAt(13).at, memberId, customerName: "East Side", lat: 30.2672, lng: -97.67 });

        await page.goto(`/dashboard/routes?date=${tomorrowAt(9).date}`);
        const route = page.getByTestId("member-route");
        await expect(route).toContainText("3 jobs");
        await route.getByRole("button", { name: "Plan route" }).click();

        const stops = route.getByTestId("route-stop");
        await expect(stops).toHaveCount(3);
        await expect(stops.nth(0)).toContainText("South Side");
        await expect(stops.nth(1)).toContainText("East Side");
        await expect(stops.nth(2)).toContainText("North Side");
        await expect(route.getByTestId("route-saved")).not.toHaveText("Already optimal");
        await expect(route.getByRole("link", { name: "Start navigation" })).toHaveAttribute("href", /google\.com\/maps\/dir/);

        // Crew can mark progress on the day.
        await stops.nth(0).getByRole("button", { name: "Arrived" }).click();
        await expect(stops.nth(0)).toContainText("· arrived");
        await stops.nth(0).getByRole("button", { name: "Done" }).click();
        await expect(stops.nth(0)).toContainText("· completed");
        await expect(stops.nth(0).getByRole("button")).toHaveCount(0);
    });
});

test.describe("payouts", () => {
    test("explains setup when payments aren't configured", async ({ page }) => {
        await ownerWithBusiness(page);
        await page.goto("/dashboard/payouts");
        await expect(page.getByText("Payments aren't configured yet")).toBeVisible();
    });
});

test.describe("crew", () => {
    test("crew see the schedule and routes, not money or settings", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id);
        const crew = await addCrewMember(business.id);

        await logIn(page, crew.email, crew.password);
        await expectOnPath(page, "/dashboard");
        const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
        await expect(nav.getByRole("link", { name: "Schedule" })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Payouts" })).toHaveCount(0);

        await page.goto("/dashboard/services");
        await expect(page.getByRole("heading", { name: "Owners and admins only" })).toBeVisible();
        await page.goto("/dashboard/payouts");
        await expect(page.getByRole("heading", { name: "Owners and admins only" })).toBeVisible();
    });
});

/** A real JPEG drawn on a canvas, larger than the app's resize limit, like a phone photo. */
async function makeJpeg(page: Page, label: string) {
    const base64 = await page.evaluate((text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 3000;
        canvas.height = 2000;
        const context = canvas.getContext("2d")!;
        const gradient = context.createLinearGradient(0, 0, 3000, 2000);
        gradient.addColorStop(0, "#1c3d70");
        gradient.addColorStop(1, "#ff7a33");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 3000, 2000);
        context.fillStyle = "#ffffff";
        context.font = "bold 240px sans-serif";
        context.fillText(text, 200, 1100);
        return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    }, label);
    return Buffer.from(base64, "base64");
}
