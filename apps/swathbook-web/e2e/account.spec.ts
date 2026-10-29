import { expect, test, type Page } from "@playwright/test";
import { addJob, admin, createBusiness, createUser, memberIdFor } from "./support/admin";
import { expectOnPath, formAlert, logIn } from "./support/auth";
import { PASSWORD, uniqueEmail } from "./support/data";
import { getAuthLink } from "./support/mail";
import { tomorrowAt } from "./support/time";

async function signedInOwner(page: Page) {
    const user = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(user.id, { name: "Olive's Lawn" });
    await logIn(page, user.email, user.password);
    await expectOnPath(page, "/dashboard");
    return { user, business };
}

test.describe("account settings", () => {
    test("reachable from the header and the footer", async ({ page }) => {
        await signedInOwner(page);
        await page.getByRole("banner").getByRole("link", { name: "Account" }).click();
        await expectOnPath(page, "/dashboard/account");
        await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();

        const footer = page.getByRole("contentinfo");
        await expect(footer.getByRole("link", { name: "Account settings" })).toHaveAttribute("href", "/dashboard/account");
        await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    });

    test("change your name", async ({ page }) => {
        const { user } = await signedInOwner(page);
        await page.goto("/dashboard/account");
        await page.getByLabel("Full name").fill("Olive Q. Owner");
        await page.getByRole("button", { name: "Save name" }).click();
        await expect(page.getByText("Name saved.")).toBeVisible();

        const { data } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
        expect(data?.full_name).toBe("Olive Q. Owner");
        await page.reload();
        await expect(page.getByLabel("Full name")).toHaveValue("Olive Q. Owner");
    });

    test("change your password, then log in with the new one", async ({ page }) => {
        const { user } = await signedInOwner(page);
        await page.goto("/dashboard/account");
        const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Password", exact: true }) });

        await card.getByLabel("Current password").fill("not-my-password");
        await card.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
        await card.getByLabel("Confirm new password").fill("a-brand-new-password");
        await card.getByRole("button", { name: "Change password" }).click();
        await expect(card.getByText("That password isn't right.")).toBeVisible();

        await card.getByLabel("Current password").fill(PASSWORD);
        await card.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
        await card.getByLabel("Confirm new password").fill("a-brand-new-password");
        await card.getByRole("button", { name: "Change password" }).click();
        await expect(page.getByText("Password changed.")).toBeVisible();

        await page.getByRole("button", { name: "Log out" }).click();
        await expectOnPath(page, "/auth/login");
        await logIn(page, user.email, "a-brand-new-password");
        await expectOnPath(page, "/dashboard");
    });

    test("change your email after confirming the new address", async ({ page }) => {
        const { user } = await signedInOwner(page);
        const newEmail = uniqueEmail("moved");
        await page.goto("/dashboard/account");

        const emailCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Email", exact: true }) });
        await emailCard.getByLabel("New email").fill(newEmail);
        await emailCard.getByLabel("Current password").fill(PASSWORD);
        await emailCard.getByRole("button", { name: "Change email" }).click();
        await expect(page.getByText(`Check ${newEmail} for a confirmation link`)).toBeVisible();

        // Secure email change: both the old and the new inbox get a link.
        await page.goto(await getAuthLink(user.email, /Confirm your new Swathbook email/));
        await page.goto(await getAuthLink(newEmail, /Confirm your new Swathbook email/));
        await expectOnPath(page, "/dashboard/account");
        await expect(page.getByTestId("current-email")).toHaveText(newEmail);

        await page.getByRole("button", { name: "Log out" }).click();
        await expectOnPath(page, "/auth/login");
        await logIn(page, newEmail, PASSWORD);
        await expectOnPath(page, "/dashboard");
    });

    test("an upcoming job blocks deleting the account", async ({ page }) => {
        const { user, business } = await signedInOwner(page);
        await addJob(business.id, { start: tomorrowAt(10).at, memberId: await memberIdFor(business.id, user.id), customerName: "Waiting Wendy", lat: 30.2, lng: -97.7 });
        await page.goto("/dashboard/account");

        await page.getByLabel(/Type .delete my account. to confirm/).fill("delete my account");
        await page.getByLabel("Current password").last().fill(PASSWORD);
        await page.getByRole("button", { name: "Delete my account" }).click();
        await expect(formAlert(page, "Your businesses still have an upcoming job. Cancel or finish it first so no customer is left waiting.")).toBeVisible();

        const { data } = await admin.from("businesses").select("id").eq("id", business.id);
        expect(data).toHaveLength(1);
    });

    test("delete your account and its business", async ({ page }) => {
        const { user, business } = await signedInOwner(page);
        await page.goto("/dashboard/account");
        await expect(page.getByRole("main").getByText("Olive's Lawn", { exact: true })).toBeVisible();

        await page.getByLabel(/Type .delete my account. to confirm/).fill("delete my account");
        await page.getByLabel("Current password").last().fill(PASSWORD);
        await page.getByRole("button", { name: "Delete my account" }).click();

        await expectOnPath(page, "/auth/login");
        await expect(page.getByText("Your account has been deleted.")).toBeVisible();
        const [{ data: businesses }, { data: authUser }] = await Promise.all([
            admin.from("businesses").select("id").eq("id", business.id),
            admin.auth.admin.getUserById(user.id),
        ]);
        expect(businesses).toHaveLength(0);
        expect(authUser.user).toBeNull();

        // The booking link is gone and the old login no longer works.
        const response = await page.request.get(`/l/${business.slug}`);
        expect(await response.text()).toContain("This page took a wrong turn.");
        await logIn(page, user.email, PASSWORD);
        await expect(formAlert(page, /don't match/)).toBeVisible();
    });
});
