import { expect, test, type Page } from "@playwright/test";
import { addJob, admin, createBusiness, createUser, memberIdFor } from "./support/admin";
import { expectOnPath, logIn, openTab } from "./support/auth";
import { uniqueEmail } from "./support/data";
import { tomorrowAt } from "./support/time";

/** A phone-sized JPEG drawn in the page, so the upload goes through the real resize. */
async function makeJpeg(page: Page, color: string) {
    const base64 = await page.evaluate((fill) => {
        const canvas = document.createElement("canvas");
        canvas.width = 2400;
        canvas.height = 1800;
        const context = canvas.getContext("2d")!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 2400, 1800);
        return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    }, color);
    return Buffer.from(base64, "base64");
}

test.describe("measured quotes", () => {
    test("a customer sizes their yard and books at that price", async ({ page }) => {
        const owner = await createUser();
        const business = await createBusiness(owner.id, { openEveryDay: true, services: [] });
        await admin.from("services").insert({
            business_id: business.id,
            name: "Aeration",
            price_type: "starting_at",
            price_cents: 4_000,
            duration_minutes: 30,
            price_per_1000_sqft_cents: 800,
            minutes_per_1000_sqft: 4,
        });
        const email = uniqueEmail("customer");

        await page.goto(`/l/${business.slug}`);
        await expect(page.getByText("Instant price: measure your yard on the map")).toBeVisible();
        await page.getByRole("checkbox", { name: /Aeration/ }).check();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByLabel("Street address").fill("10 Oak Ln");
        await page.getByLabel("City").fill("Austin");
        await page.getByRole("button", { name: "Continue" }).click();

        // No Google key in tests, so there's no satellite photo: the size is typed instead.
        await expect(page.getByRole("heading", { name: "Outline the area" })).toBeVisible();
        await page.getByLabel("Area in square feet").fill("12,500");
        await expect(page.getByText("$100")).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByRole("button", { name: /^\d{1,2}:\d{2} [AP]M$/ }).first().click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByLabel("Your name").fill("Pat Customer");
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Book it" }).click();
        await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible();

        const { data: booking } = await admin
            .from("bookings")
            .select("measured_area_sqft, scheduled_start, scheduled_end, booking_items(unit_price_cents)")
            .eq("business_id", business.id)
            .single();
        expect(booking).toMatchObject({ measured_area_sqft: 12_500, booking_items: [{ unit_price_cents: 10_000 }] });
        // 12,500 sq ft × 4 min per 1,000 = 50 minutes.
        expect(Date.parse(booking!.scheduled_end) - Date.parse(booking!.scheduled_start)).toBe(50 * 60_000);
    });
});

test.describe("job reports", () => {
    test("the crew adds photos and a note, and the customer gets the report", async ({ page, browser }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Bright Nest Lawns", openEveryDay: true });
        await admin.from("businesses").update({ google_review_url: "https://g.page/r/bright-nest/review" }).eq("id", business.id);
        const { bookingId } = await addJob(business.id, {
            start: tomorrowAt(10).at,
            memberId: await memberIdFor(business.id, owner.id),
            customerName: "Pat Customer",
            lat: 30.27,
            lng: -97.74,
        });
        const { data: booking } = await admin.from("bookings").select("public_token").eq("id", bookingId).single();
        const reportPath = `/booking/${booking!.public_token}/report`;

        // Before the job is done, the report says it's coming.
        const customer = await (await browser.newContext()).newPage();
        await customer.goto(reportPath);
        await expect(customer.getByRole("heading", { name: "Your report isn't ready yet" })).toBeVisible();

        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        await page.goto(`/dashboard/schedule/${bookingId}`);
        await openTab(page, "Report");
        await page.getByLabel("Add before photos").setInputFiles({ name: "before.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "#6b4f2a") });
        await expect(page.getByTestId("photos-before").getByRole("img")).toHaveCount(1);
        await page.getByLabel("Add after photos").setInputFiles({ name: "after.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, "#2f7d32") });
        await expect(page.getByTestId("photos-after").getByRole("img")).toHaveCount(1);
        await page.getByLabel("Note for the customer").fill("Edged along the driveway.");
        await page.getByRole("button", { name: "Save note" }).click();
        await expect(page.getByText("Note saved.")).toBeVisible();

        await page.getByRole("button", { name: "Start job" }).click();
        await expect(page.getByText("In progress").first()).toBeVisible();
        await page.getByRole("button", { name: "Mark complete" }).click();
        await expect(page.getByText("Completed").first()).toBeVisible();

        await customer.goto(reportPath);
        await expect(customer.getByRole("heading", { name: "All done" })).toBeVisible();
        await expect(customer.getByRole("heading", { name: "Before and after" })).toBeVisible();
        await expect(customer.getByLabel("Slide between the before and after photos")).toBeVisible();
        await expect(customer.getByText("Edged along the driveway.")).toBeVisible();
        await expect(customer.getByRole("link", { name: "Leave a Google review" })).toHaveAttribute("href", "https://g.page/r/bright-nest/review");
        // No Stripe in tests, so no tip prompt.
        await expect(customer.getByTestId("tip")).toHaveCount(0);

        // The booking page points to it, and the email is queued for a little later.
        await customer.goto(`/booking/${booking!.public_token}`);
        await expect(customer.getByTestId("report-link")).toBeVisible();
        const { data: queued } = await admin.from("notifications").select("template").eq("booking_id", bookingId).eq("template", "booking.job_report");
        expect(queued).toHaveLength(1);
    });
});
