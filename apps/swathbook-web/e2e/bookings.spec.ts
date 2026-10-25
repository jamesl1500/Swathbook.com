import { expect, test, type Page } from "@playwright/test";
import { addDays, formatDateShort } from "../src/libs/time";
import { addJob, admin, createBusiness, createUser, memberIdFor } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { uniqueEmail } from "./support/data";
import { waitForEmail } from "./support/mail";
import { chicagoDateKey, tomorrowAt } from "./support/time";

async function ownerSignedIn(page: Page, options: Parameters<typeof createBusiness>[1] = {}) {
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, { name: "Bright Nest Cleaning", openEveryDay: true, ...options });
    await logIn(page, owner.email, owner.password);
    await expectOnPath(page, "/dashboard");
    return { owner, business };
}

/** A real booking through create_booking, `days` from now at 10 AM Chicago. */
async function bookAhead(businessId: string, days: number, name: string, email = uniqueEmail("customer")) {
    const { data: service } = await admin.from("services").select("id").eq("business_id", businessId).limit(1).single();
    const dayKey = addDays(chicagoDateKey(new Date()), days);
    const start = new Date(`${dayKey}T16:00:00Z`); // 10 or 11 AM in Chicago, inside 6 AM – 9 PM hours
    const { data, error } = await admin.rpc("create_booking", {
        p_business_id: businessId,
        p_service_ids: [service!.id],
        p_start: start.toISOString(),
        p_customer: { full_name: name, email, phone: "512-555-0142" },
        p_address: { line1: "9 Oak Ln", city: "Austin" },
    });
    if (error) throw error;
    return { ...data![0], email, dayKey };
}

test.describe("bookings page", () => {
    test("lists, counts and filters bookings, and accepts a request", async ({ page }) => {
        const { owner, business } = await ownerSignedIn(page);
        const memberId = await memberIdFor(business.id, owner.id);
        await addJob(business.id, { start: tomorrowAt(9).at, memberId, customerName: "Uma Upcoming", lat: 30.2, lng: -97.7 });
        const past = await addJob(business.id, { start: new Date(Date.now() - 3 * 86_400_000), memberId, customerName: "Pete Past", lat: 30.2, lng: -97.7 });
        await admin.from("bookings").update({ status: "completed" }).eq("id", past.bookingId);
        await admin.from("businesses").update({ auto_confirm: false }).eq("id", business.id);
        await bookAhead(business.id, 4, "Rita Request");

        await page.goto("/dashboard/bookings");
        await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
        const rows = page.getByTestId("booking-row");
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0)).toContainText("Uma Upcoming");
        await expect(rows.nth(1)).toContainText("Rita Request");
        await expect(page.getByTestId("count-requests")).toHaveText("1");

        // Search
        await page.getByLabel("Search bookings").fill("rita");
        await page.getByRole("button", { name: "Filter" }).click();
        await expect(rows).toHaveCount(1);
        await page.getByRole("link", { name: "Clear" }).click();
        await expect(page.getByLabel("Search bookings")).toHaveValue("");
        await expect(rows).toHaveCount(2);

        // Requests tab: accept from the list.
        await page.getByRole("link", { name: /Requests/ }).click();
        await expect(rows).toHaveCount(1);
        await page.getByRole("button", { name: "Accept Rita Request's request" }).click();
        await expect(page.getByText("Job updated.")).toBeVisible();
        await page.reload();
        await expect(page.getByTestId("count-requests")).toHaveCount(0);

        // Past tab, filtered by status.
        await page.getByRole("link", { name: "Past" }).click();
        await expect(rows.filter({ hasText: "Pete Past" })).toContainText("Completed");
        await page.getByLabel("Status").selectOption("cancelled");
        await page.getByRole("button", { name: "Filter" }).click();
        await expect(page.getByText("No bookings match")).toBeVisible();
    });
});

test.describe("customer self-service", () => {
    test("a customer reschedules online, then asks to cancel; the owner declines, then approves", async ({ page, browser }) => {
        const { owner, business } = await ownerSignedIn(page);
        const booking = await bookAhead(business.id, 3, "Cara Customer");
        const customerContext = await browser.newContext();
        const customer = await customerContext.newPage();

        // Reschedule to two days later.
        await customer.goto(`/booking/${booking.public_token}`);
        await customer.getByRole("button", { name: "Reschedule" }).click();
        const newDay = addDays(booking.dayKey, 2);
        await customer.getByRole("radio", { name: formatDateShort(newDay) }).click();
        const firstTime = customer.getByRole("radiogroup", { name: "Pick a new time" }).getByRole("radio").first();
        await expect(firstTime).toBeVisible();
        await firstTime.click();
        await customer.getByRole("button", { name: /^Move to / }).click();
        await expect(customer.getByText(/Moved to .* We've emailed you the new time\./)).toBeVisible();
        await expect(customer.getByText("You can move it online 2 more times.")).toBeVisible();

        await waitForEmail(booking.email, /New time: Bright Nest Cleaning/);
        await waitForEmail(owner.email, /Rescheduled: Cara Customer/);
        const { data: moved } = await admin.from("bookings").select("scheduled_start, customer_reschedule_count").eq("id", booking.booking_id).single();
        expect(chicagoDateKey(new Date(moved!.scheduled_start))).toBe(newDay);
        expect(moved!.customer_reschedule_count).toBe(1);

        // Ask to cancel.
        await customer.getByRole("button", { name: "Request to cancel" }).click();
        await customer.getByLabel("Reason (optional)").fill("Moving out of town");
        await customer.getByRole("button", { name: "Send cancellation request" }).click();
        await expect(customer.getByText("Request sent. Bright Nest Cleaning will confirm by email.")).toBeVisible();
        await waitForEmail(owner.email, /Cancellation request: Cara Customer/);
        await customer.reload();
        await expect(customer.getByRole("heading", { name: "Cancellation requested" }).first()).toBeVisible();
        await expect(customer.getByRole("button", { name: "Reschedule" })).toHaveCount(0);

        // The owner declines from Bookings, with a note.
        await page.goto("/dashboard/bookings?view=cancel");
        const row = page.getByTestId("booking-row").filter({ hasText: "Cara Customer" });
        await expect(row).toContainText("Moving out of town");
        await row.getByRole("button", { name: "Decline Cara Customer's cancellation" }).click();
        await row.getByLabel("Note for Cara Customer (optional)").fill("We can do another week instead");
        await row.getByRole("button", { name: "Keep the booking" }).click();
        await expect(page.getByText(/Request declined/)).toBeVisible();
        const declined = await waitForEmail(booking.email, /is still on/);
        expect(declined.Text).toContain("We can do another week instead");

        // Asked again; the owner approves from the job page.
        await customer.reload();
        await customer.getByRole("button", { name: "Request to cancel" }).click();
        await customer.getByRole("button", { name: "Send cancellation request" }).click();
        await expect(customer.getByText(/Request sent/)).toBeVisible();
        await page.goto(`/dashboard/schedule/${booking.booking_id}`);
        await expect(page.getByTestId("cancel-request")).toContainText("Cara Customer asked to cancel");
        await page.getByRole("button", { name: "Approve cancellation for Cara Customer" }).click();
        await expect(page.getByText(/Booking cancelled/)).toBeVisible();
        await waitForEmail(booking.email, /was cancelled/);
        await customer.reload();
        await expect(customer.getByText("This appointment was cancelled.")).toBeVisible();
        await customerContext.close();
    });

    test("inside the cancellation window, moving online is off but asking to cancel works", async ({ page }) => {
        const { business } = await ownerSignedIn(page);
        await admin.from("businesses").update({ cancellation_window_hours: 96 }).eq("id", business.id);
        const booking = await bookAhead(business.id, 2, "Late Larry");

        await page.goto(`/booking/${booking.public_token}`);
        await expect(page.getByTestId("manage-booking")).toContainText("It's too close to your appointment to move it online.");
        await expect(page.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Request to cancel" })).toBeVisible();
    });

    test("a request the business hasn't accepted is cancelled right away", async ({ page }) => {
        const { owner, business } = await ownerSignedIn(page);
        await admin.from("businesses").update({ auto_confirm: false }).eq("id", business.id);
        const booking = await bookAhead(business.id, 5, "Quinn Quick");

        await page.goto(`/booking/${booking.public_token}`);
        await page.getByRole("button", { name: "Cancel booking" }).click();
        await page.getByRole("button", { name: "Cancel booking" }).click();
        await expect(page.getByText("Your booking is cancelled. We've emailed you a confirmation.")).toBeVisible();
        await waitForEmail(owner.email, /Request withdrawn: Quinn Quick/);
        const { data } = await admin.from("bookings").select("status").eq("id", booking.booking_id).single();
        expect(data!.status).toBe("cancelled");
    });
});
