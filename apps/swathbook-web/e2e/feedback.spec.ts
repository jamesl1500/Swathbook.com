import { expect, test, type Page } from "@playwright/test";
import { admin, createBusiness, createUser, runCron } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { uniqueEmail, uniqueId } from "./support/data";
import { env } from "./support/env";
import { waitForEmail, waitForEmailContaining } from "./support/mail";

test.describe("feedback", () => {
    test("an owner sends feedback from where they are, and the team replies", async ({ page, browser }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Feedback Lawns" });
        const note = `The schedule froze when I dragged a job ${uniqueId()}`;

        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        await page.goto("/dashboard/schedule");
        await page.getByRole("link", { name: "Send feedback" }).click();
        await expectOnPath(page, "/dashboard/feedback");
        expect(new URL(page.url()).searchParams.get("from")).toBe("/dashboard/schedule");

        await page.getByText("Something's broken").click();
        await page.getByLabel("Your feedback").fill(note);
        await page.locator('label[title="Pretty good"]').click();
        await page.getByRole("button", { name: "Send feedback" }).click();
        await expect(page.getByText(/Your feedback went straight to the team/)).toBeVisible();
        // The form starts over, and the note shows under "Your feedback".
        await expect(page.getByLabel("Your feedback")).toHaveValue("");
        const history = page.getByTestId("feedback-history");
        await expect(history.getByText(note)).toBeVisible();
        await expect(history.getByText("Received")).toBeVisible();

        const { data: saved } = await admin.from("feedback").select("source, kind, rating, page, business_id, platform, email, contact_ok").eq("message", note).single();
        expect(saved).toMatchObject({ source: "web", kind: "problem", rating: 4, page: "/dashboard/schedule", business_id: business.id, email: owner.email, contact_ok: true });
        expect(saved!.platform).toMatch(/Chrome/);

        // The minute cron emails the team.
        await runCron();
        const digest = await waitForEmailContaining(env.feedbackInbox, note);
        expect(digest.Text).toContain(owner.email);
        expect(digest.Text).toContain("Feedback Lawns");

        // Staff triage it and reply from the inbox.
        const staff = await createUser({ fullName: "Sam Staff", email: env.staffEmail });
        const staffPage = await (await browser.newContext()).newPage();
        await logIn(staffPage, staff.email, staff.password, { next: "/admin/feedback" });
        await expectOnPath(staffPage, "/admin/feedback");
        const card = staffPage.getByTestId("feedback-inbox").getByRole("listitem").filter({ hasText: note });
        await card.getByLabel("Status").selectOption("planned");
        await card.getByLabel("Reply to the sender").fill("Thanks! We found it and it's fixed in this week's update.");
        await card.getByRole("button", { name: "Save" }).click();
        await expect(card.getByText("Saved.")).toBeVisible();

        // The owner sees where it stands, and the reply.
        await page.reload();
        await expect(history.getByText("Planned")).toBeVisible();
        await expect(history.getByText("We found it and it's fixed in this week's update.")).toBeVisible();
    });

    test("only staff can open the inbox", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        await createBusiness(owner.id);
        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        // The page streams, so the status is already sent; what matters is that it shows nothing.
        await page.goto("/admin/feedback");
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await expect(page.getByTestId("feedback-inbox")).toHaveCount(0);
    });

    test("a customer sends feedback from their account", async ({ page }) => {
        const email = uniqueEmail("customer");
        await page.goto("/my/feedback");
        await signInWithCode(page, email);
        await page.goto("/my/feedback");

        await page.getByText("Something I love").click();
        await page.getByLabel("Your feedback").fill("Booking took under a minute. Lovely.");
        await page.getByText("You can email me about this").click();
        await page.getByRole("button", { name: "Send feedback" }).click();
        await expect(page.getByText(/Your feedback went straight to the team/)).toBeVisible();

        const { data: saved } = await admin.from("feedback").select("kind, business_id, contact_ok").eq("email", email).single();
        expect(saved).toEqual({ kind: "praise", business_id: null, contact_ok: false });
    });
});

/** The customer sign-in with an emailed code (as in customer.spec.ts). */
async function signInWithCode(page: Page, email: string) {
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    const message = await waitForEmail(email, /Confirm your Swathbook account|Your Swathbook sign-in code/);
    const code = message.Text.match(/\b(\d{6,10})\b/)?.[1];
    expect(code, "sign-in code in the email").toBeTruthy();
    await page.getByLabel("Sign-in code").fill(code!);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Signed in once the page has left the sign-in form.
    await expect(page).toHaveURL(/\/my\/(?!sign-in)/);
}
