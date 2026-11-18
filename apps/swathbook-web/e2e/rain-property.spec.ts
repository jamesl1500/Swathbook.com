import { expect, test } from "@playwright/test";
import { addDays } from "../src/libs/time";
import { addCrewMember, addJob, admin, createBusiness, createUser, memberIdFor, runCron } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { waitForEmail } from "./support/mail";
import { tomorrowAt } from "./support/time";

test.describe("rain days", () => {
    test("the owner moves a rained-out day and customers hear about it", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Bright Nest Lawns", openEveryDay: true });
        const memberId = await memberIdFor(business.id, owner.id);
        const { date, at } = tomorrowAt(10);
        const ann = await addJob(business.id, { start: at, memberId, customerName: "Ann Rainey", lat: 30.27, lng: -97.74 });
        const bea = await addJob(business.id, { start: new Date(at.getTime() + 2 * 60 * 60_000), memberId, customerName: "Bea Dry", lat: 30.28, lng: -97.75 });
        const { data: annCustomer } = await admin.from("customers").select("email").eq("id", ann.customerId).single();

        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        await page.goto("/dashboard/schedule");
        await page.getByRole("link", { name: "Rain days" }).click();
        await expectOnPath(page, "/dashboard/schedule/rain");

        // No Google key in tests, so no forecast: the planner still works by hand.
        await expect(page.getByText(/forecast isn't available|can still move a day's jobs/).first()).toBeVisible();
        await page.getByLabel("Rainy day").fill(date);
        await page.getByLabel("Move jobs to").selectOption(addDays(date, 1));
        await page.getByRole("button", { name: "See where jobs would go" }).click();

        const preview = page.getByTestId("rain-preview");
        await expect(preview.getByText("Ann Rainey")).toBeVisible();
        await expect(preview.getByText("Bea Dry")).toBeVisible();
        // Previewing changes nothing.
        const { data: before } = await admin.from("bookings").select("scheduled_start").eq("id", ann.bookingId).single();
        expect(Date.parse(before!.scheduled_start)).toBe(at.getTime());

        // Bea's job is under cover today: leave it.
        await preview.getByRole("checkbox", { name: "Move Bea Dry" }).uncheck();
        await preview.getByRole("button", { name: "Move 1 job and email customers" }).click();
        await expect(page.getByText(/Moved 1 job to/).first()).toBeVisible();

        const { data: moved } = await admin.from("bookings").select("scheduled_start, rain_delay_id").eq("id", ann.bookingId).single();
        expect(Date.parse(moved!.scheduled_start)).toBe(at.getTime() + 24 * 60 * 60_000);
        expect(moved!.rain_delay_id).not.toBeNull();
        const { data: stayed } = await admin.from("bookings").select("scheduled_start").eq("id", bea.bookingId).single();
        expect(Date.parse(stayed!.scheduled_start)).toBe(at.getTime() + 2 * 60 * 60_000);
        await expect(page.getByText("Recent rain days")).toBeVisible();

        await runCron();
        const email = await waitForEmail(annCustomer!.email!, /Rain delay: Bright Nest Lawns moved you/);
        expect(email.Text).toContain("rain is forecast");
    });
});

test.describe("property notes", () => {
    test("a crew member adds the gate code and pets, and everyone sees them", async ({ page, browser }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Bright Nest Lawns", openEveryDay: true });
        const crew = await addCrewMember(business.id, "Carl Crew");
        const { bookingId, customerId } = await addJob(business.id, {
            start: tomorrowAt(10).at,
            memberId: crew.memberId,
            customerName: "Pat Gate",
            lat: 30.27,
            lng: -97.74,
        });

        await logIn(page, crew.email, crew.password);
        await expectOnPath(page, "/dashboard");
        await page.goto(`/dashboard/schedule/${bookingId}`);
        const property = page.getByTestId("property-notes");
        await property.getByRole("button", { name: "Add property notes" }).click();
        await page.getByLabel("Gate code").fill("4321#");
        await page.getByLabel("Pets").fill("Friendly lab, keep the side gate shut");
        await page.getByRole("button", { name: "Save property notes" }).click();
        await expect(page.getByText("Property notes saved.")).toBeVisible();
        await expect(page.getByTestId("gate-code")).toHaveText("4321#");
        await expect(page.getByText("Friendly lab, keep the side gate shut")).toBeVisible();

        // The owner sees them on the customer.
        const ownerPage = await (await browser.newContext()).newPage();
        await logIn(ownerPage, owner.email, owner.password);
        await expectOnPath(ownerPage, "/dashboard");
        await ownerPage.goto(`/dashboard/customers/${customerId}`);
        await expect(ownerPage.getByTestId("gate-code")).toHaveText("4321#");
    });
});
