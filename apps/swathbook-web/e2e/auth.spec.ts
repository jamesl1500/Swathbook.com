import { expect, test } from "@playwright/test";
import { createBusiness, createUser } from "./support/admin";
import { chooseTrade, expectOnPath, formAlert, logIn } from "./support/auth";
import { PASSWORD, uniqueEmail, uniqueSlug } from "./support/data";
import { countEmails, getAuthLink } from "./support/mail";

test.describe("sign up", () => {
    test("claim a link on the homepage, sign up, confirm the email and land in onboarding with the link reserved", async ({ page }) => {
        const slug = uniqueSlug("claimed");
        const email = uniqueEmail("signup");

        await page.goto("/");
        // The hero form; the closing section has a second one.
        await page.getByLabel("swathbook.com/").first().fill(slug);
        await page.getByRole("button", { name: "Claim it" }).first().click();

        await expectOnPath(page, "/auth/signup");
        await expect(page.getByText(`Saving swathbook.com/${slug} for you`)).toBeVisible();

        await page.getByLabel("Your name").fill("Dana Field");
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
        await page.getByRole("button", { name: "Create account" }).click();

        await expectOnPath(page, "/auth/verify_email");
        await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
        await expect(page.getByText(email)).toBeVisible();

        await page.goto(await getAuthLink(email, /Confirm your Swathbook account/));

        await expectOnPath(page, "/onboarding");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hey Dana, let's set up your business");

        await page.getByLabel("Business name").fill("Dana's Lawns");
        await chooseTrade(page, "Lawn mowing");
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByLabel("Your booking link")).toHaveValue(slug);
    });

    test("shows validation errors from the server", async ({ page }) => {
        await page.goto("/auth/signup");
        await page.getByLabel("Email").fill("not-an-email");
        await page.getByLabel("Password", { exact: true }).fill("short");
        await page.getByRole("button", { name: "Create account" }).click();

        await expect(page.getByText("Tell us your name.")).toBeVisible();
        await expect(page.getByText("Enter a valid email address.")).toBeVisible();
        await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
        await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
    });

    test("an unconfirmed owner who tries to log in is sent to verify, can resend, and confirm", async ({ page }) => {
        const user = await createUser({ confirmed: false });

        await logIn(page, user.email, user.password);
        await expectOnPath(page, "/auth/verify_email");
        await expect(page.getByText(user.email)).toBeVisible();

        const before = await countEmails(user.email);
        await page.getByRole("button", { name: "Resend confirmation email" }).click();
        await expect(page.getByRole("status")).toHaveText(`Sent a fresh link to ${user.email}.`);

        await page.goto(await getAuthLink(user.email, /Confirm your Swathbook account/, { minCount: before + 1 }));
        await expectOnPath(page, "/onboarding");
    });

    test("a broken or used confirmation link explains what happened", async ({ page }) => {
        await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email&next=/onboarding");
        await expectOnPath(page, "/auth/verify_email");
        await expect(page.getByText(/expired or was already used/)).toBeVisible();
    });
});

test.describe("log in", () => {
    test("a wrong password shows one generic error and keeps the email", async ({ page }) => {
        const user = await createUser();
        await logIn(page, user.email, "definitely-wrong");

        await expect(formAlert(page, "don't match")).toBeVisible();
        await expect(page.getByLabel("Email")).toHaveValue(user.email);
        await expectOnPath(page, "/auth/login");
    });

    test("an owner without a business goes to onboarding", async ({ page }) => {
        const user = await createUser();
        await logIn(page, user.email, user.password);
        await expectOnPath(page, "/onboarding");
    });

    test("a protected page sends you to log in, then back where you were going", async ({ page }) => {
        const user = await createUser();
        const business = await createBusiness(user.id, { name: "Returning Lawn Co" });

        await page.goto("/dashboard");
        await expectOnPath(page, "/auth/login");
        expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard");

        await page.getByLabel("Email").fill(user.email);
        await page.getByLabel("Password", { exact: true }).fill(user.password);
        await page.getByRole("button", { name: "Log in" }).click();

        await expectOnPath(page, "/dashboard");
        await expect(page.getByRole("heading", { name: `${business.name} is ready for bookings` })).toBeVisible();
    });

    test("signed-in owners skip the login and signup pages", async ({ page }) => {
        const user = await createUser();
        await createBusiness(user.id);
        await logIn(page, user.email, user.password);
        await expectOnPath(page, "/dashboard");

        await page.goto("/auth/login");
        await expectOnPath(page, "/dashboard");
        await page.goto("/auth/signup");
        await expectOnPath(page, "/dashboard");
    });

    test("logging out ends the session", async ({ page }) => {
        const user = await createUser();
        await createBusiness(user.id);
        await logIn(page, user.email, user.password);
        await expectOnPath(page, "/dashboard");

        await page.getByRole("button", { name: "Log out" }).click();
        await expectOnPath(page, "/auth/login");

        await page.goto("/dashboard");
        await expectOnPath(page, "/auth/login");
    });
});

test.describe("password reset", () => {
    test("request a reset email, choose a new password, and only the new one works afterwards", async ({ page }) => {
        const user = await createUser();
        await createBusiness(user.id);
        const newPassword = "brand-new-password";

        await page.goto("/auth/login");
        await page.getByRole("link", { name: "Forgot password?" }).click();
        await expectOnPath(page, "/auth/forgot_password");
        await page.getByLabel("Email").fill(user.email);
        await page.getByRole("button", { name: "Send reset link" }).click();
        await expect(page.getByRole("status")).toContainText(`If there's an account for ${user.email}`);

        await page.goto(await getAuthLink(user.email, /Reset your Swathbook password/));
        await expectOnPath(page, "/auth/reset_password");

        await page.getByLabel("New password", { exact: true }).fill(newPassword);
        await page.getByLabel("Confirm new password").fill("something-else");
        await page.getByRole("button", { name: "Save new password" }).click();
        await expect(page.getByText("Passwords don't match.")).toBeVisible();

        await page.getByLabel("New password", { exact: true }).fill(newPassword);
        await page.getByLabel("Confirm new password").fill(newPassword);
        await page.getByRole("button", { name: "Save new password" }).click();
        await expectOnPath(page, "/dashboard");

        await page.getByRole("button", { name: "Log out" }).click();
        await expectOnPath(page, "/auth/login");

        await logIn(page, user.email, user.password);
        await expect(formAlert(page, "don't match")).toBeVisible();

        await logIn(page, user.email, newPassword);
        await expectOnPath(page, "/dashboard");
    });

    test("doesn't reveal whether an account exists", async ({ page }) => {
        const email = uniqueEmail("ghost");
        await page.goto("/auth/forgot_password");
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Send reset link" }).click();
        await expect(page.getByRole("status")).toContainText(`If there's an account for ${email}`);
    });

    test("an expired reset link sends you back to request a new one", async ({ page }) => {
        await page.goto("/auth/confirm?token_hash=stale&type=recovery&next=/auth/reset_password");
        await expectOnPath(page, "/auth/forgot_password");
        await expect(page.getByText(/reset link expired or was already used/)).toBeVisible();
    });
});
