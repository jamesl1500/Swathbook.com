import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../src/libs/time";
import { admin, createBusiness, createUser } from "./support/admin";
import { expectOnPath } from "./support/auth";
import { uniqueEmail, uniqueId } from "./support/data";
import { waitForEmail } from "./support/mail";
import { chicagoDateKey } from "./support/time";

/** A real booking (create_booking) at a fresh business, `days` from now, made with `email`. */
async function bookingFor(email: string, { days = 3, businessName = `Fern & Field ${uniqueId()}` } = {}) {
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, { name: businessName, openEveryDay: true });
    const { data: service } = await admin.from("services").select("id").eq("business_id", business.id).limit(1).single();
    const start = new Date(`${addDays(chicagoDateKey(new Date()), days)}T16:00:00Z`);
    const { data, error } = await admin.rpc("create_booking", {
        p_business_id: business.id,
        p_service_ids: [service!.id],
        p_start: start.toISOString(),
        p_customer: { full_name: "Cara Customer", email, phone: "512-555-0142" },
        p_address: { line1: "9 Oak Ln", city: "Austin" },
    });
    if (error) throw error;
    return { business, bookingId: data![0].booking_id as string };
}

/** Signs in through the emailed code, starting from wherever the page is now. */
async function signInWithCode(page: Page, email: string) {
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    // New accounts get the "confirm" email, existing ones the "sign-in code" one; both carry the code.
    const message = await waitForEmail(email, /Confirm your Swathbook account|Your Swathbook sign-in code/);
    const code = message.Text.match(/\b(\d{6,10})\b/)?.[1];
    expect(code, "sign-in code in the email").toBeTruthy();
    await page.getByLabel("Sign-in code").fill(code!);
    await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("customer accounts", () => {
    test("signs in with an emailed code and sees bookings made with that email", async ({ page }) => {
        const email = uniqueEmail("cara");
        const { business, bookingId } = await bookingFor(email);

        await page.goto("/my/jobs");
        await expectOnPath(page, "/my/sign-in");
        await signInWithCode(page, email);

        await expectOnPath(page, "/my/jobs");
        await expect(page.getByRole("heading", { name: "My jobs", level: 1 })).toBeVisible();
        await expect(page.getByText("Next visit")).toBeVisible();
        const card = page.getByRole("article").filter({ hasText: business.name });
        await expect(card).toContainText("Weekly mow");
        await expect(card).toContainText("Confirmed");

        await card.getByRole("link", { name: "Weekly mow" }).click();
        await expectOnPath(page, `/my/jobs/${bookingId}`);
        await expect(page.getByRole("heading", { name: business.name, level: 1 })).toBeVisible();
        await expect(page.getByRole("link", { name: "Add to calendar" })).toBeVisible();

        // Ask to cancel: the business hasn't answered yet, so it stays on the calendar.
        await page.getByRole("button", { name: "Request to cancel" }).click();
        await page.getByLabel("Reason (optional)").fill("Plans changed");
        await page.getByRole("button", { name: "Send cancellation request" }).click();
        await expect(page.getByText(/Request sent\./)).toBeVisible();
        const { data: booking } = await admin.from("bookings").select("cancel_requested_at, cancel_request_reason").eq("id", bookingId).single();
        expect(booking?.cancel_requested_at).toBeTruthy();
        expect(booking?.cancel_request_reason).toBe("Plans changed");

        await page.getByRole("link", { name: "My jobs" }).first().click();
        await expect(page.getByRole("article").filter({ hasText: business.name })).toContainText("Cancel requested");
    });

    test("can't open someone else's booking", async ({ page }) => {
        const mine = uniqueEmail("mine");
        const { bookingId: theirs } = await bookingFor(uniqueEmail("theirs"));
        await page.goto("/my/sign-in");
        await signInWithCode(page, mine);
        await expectOnPath(page, "/my/jobs");
        await expect(page.getByRole("heading", { name: "No upcoming jobs" })).toBeVisible();

        // Someone else's booking looks exactly like one that doesn't exist.
        await page.goto(`/my/jobs/${theirs}`);
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await expect(page.getByText("Fern & Field")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /cancel/i })).toHaveCount(0);
    });

    test("updates profile details, then signs out", async ({ page }) => {
        const email = uniqueEmail("pat");
        await page.goto("/my/profile");
        await expectOnPath(page, "/my/sign-in");
        await signInWithCode(page, email);
        await expectOnPath(page, "/my/profile");

        await page.getByLabel("Name").fill("Pat Customer");
        await page.getByLabel("Phone").fill("512-555-0199");
        await page.getByLabel("Street address").fill("42 Pecan St");
        await page.getByLabel("City").fill("Austin");
        await page.getByRole("button", { name: "Save details" }).click();
        await expect(page.getByText("Saved. New bookings will use these details.")).toBeVisible();

        const { data: user } = await admin.auth.admin.listUsers();
        const id = user.users.find((candidate) => candidate.email === email)!.id;
        const { data: profile } = await admin.from("customer_profiles").select("address_line1, address_city").eq("user_id", id).single();
        expect(profile).toEqual({ address_line1: "42 Pecan St", address_city: "Austin" });

        await page.getByRole("button", { name: "Sign out" }).click();
        await expectOnPath(page, "/my/sign-in");
        await expect(page.getByText("You're signed out.")).toBeVisible();
        await page.goto("/my/jobs");
        await expectOnPath(page, "/my/sign-in");
    });

    test("rejects a wrong code", async ({ page }) => {
        const email = uniqueEmail("wrong");
        await page.goto("/my/sign-in");
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Email me a code" }).click();
        await page.getByLabel("Sign-in code").fill("00000000");
        await page.getByRole("button", { name: "Sign in" }).click();
        await expect(page.getByText(/That code is wrong or has expired/)).toBeVisible();
        await expectOnPath(page, "/my/sign-in");
    });

    test("keeps the customer area out of search engines", async ({ request }) => {
        const response = await request.get("/my/sign-in");
        expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    });
});
