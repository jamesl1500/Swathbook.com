import { expect, type Page } from "@playwright/test";

/** Logs in through the real form. */
export async function logIn(page: Page, email: string, password: string, { next }: { next?: string } = {}) {
    await page.goto(next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
}

export async function expectOnPath(page: Page, pathname: string) {
    await expect.poll(() => new URL(page.url()).pathname, { message: `expected to land on ${pathname}` }).toBe(pathname);
}

/** The app's own alert banners (Next.js also renders an empty role="alert" route announcer). */
export function formAlert(page: Page, text: string | RegExp) {
    return page.getByRole("alert").filter({ hasText: text });
}

/**
 * Picks a trade on the first onboarding step. Fixing a validation error re-renders
 * asynchronously and can shift the grid mid-click, so retry until it's selected.
 */
export async function chooseTrade(page: Page, name: string) {
    const radio = page.getByRole("radio", { name });
    await expect(async () => {
        await page.locator("label", { has: radio }).click();
        await expect(radio).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
}
