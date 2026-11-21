import { expect, test } from "@playwright/test";
import { admin, createBusiness, createUser, runCron } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { uniqueEmail, uniqueId } from "./support/data";
import { env } from "./support/env";
import { waitForEmailContaining } from "./support/mail";

test.describe("investors", () => {
    test("a visitor registers interest, the team is emailed, and staff follow up", async ({ page, browser }) => {
        const email = uniqueEmail("investor");
        const note = `Keen on vertical SaaS ${uniqueId()}`;

        await page.goto("/investors");
        await expect(page.getByRole("heading", { level: 1, name: "Back the software field businesses run on." })).toBeVisible();
        await expect(page.getByText("not an offer to sell")).toBeVisible();

        // Nothing typed yet: the form says what's missing.
        await page.getByRole("button", { name: "Register interest" }).click();
        await expect(page.getByText("Tell us your name.")).toBeVisible();

        await page.getByLabel("Your name").fill("Ada Park");
        await page.getByLabel("Email").fill(email);
        await page.getByLabel(/Firm or fund/).fill("Park Ventures");
        await page.getByLabel("You invest as").selectOption("fund");
        await page.getByLabel("Typical check").selectOption("25k_100k");
        await page.getByLabel(/Anything you'd like us to know/).fill(note);
        await page.getByLabel(/accredited investor/).check();
        await page.getByRole("button", { name: "Register interest" }).click();
        await expect(page.getByTestId("investor-thanks")).toContainText("You're on the list.");

        const { data: saved } = await admin.from("investor_interest").select("full_name, firm, investor_type, check_size, accredited, status").eq("email", email).single();
        expect(saved).toEqual({ full_name: "Ada Park", firm: "Park Ventures", investor_type: "fund", check_size: "25k_100k", accredited: true, status: "new" });

        // The minute cron emails the team.
        await runCron();
        const digest = await waitForEmailContaining(env.feedbackInbox, note);
        expect(digest.Text).toContain("Park Ventures");

        // Staff see it and move it along.
        const staff = await createUser({ fullName: "Sam Staff", email: env.staffEmail });
        const staffPage = await (await browser.newContext()).newPage();
        await logIn(staffPage, staff.email, staff.password, { next: "/admin/investors" });
        await expectOnPath(staffPage, "/admin/investors");
        const card = staffPage.getByTestId("investor-inbox").getByRole("listitem").filter({ hasText: note });
        await expect(card).toContainText("Venture fund");
        await card.getByLabel("Status").selectOption("meeting");
        await card.getByLabel("Notes").fill("Call booked");
        await card.getByRole("button", { name: "Save" }).click();
        await expect(card.getByText("Saved.")).toBeVisible();
        await expect.poll(async () => (await admin.from("investor_interest").select("status, notes").eq("email", email).single()).data).toEqual({ status: "meeting", notes: "Call booked" });
    });

    test("only staff can open investor interest", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        await createBusiness(owner.id);
        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        // The page streams, so the status is already sent; what matters is that it shows nothing.
        await page.goto("/admin/investors");
        await expect(page.getByRole("heading", { name: "This page took a wrong turn." })).toBeVisible();
        await expect(page.getByTestId("investor-inbox")).toHaveCount(0);
    });
});
