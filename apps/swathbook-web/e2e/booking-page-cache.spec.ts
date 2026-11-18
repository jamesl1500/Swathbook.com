import { expect, test } from "@playwright/test";
import { createBusiness, createUser } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";

/**
 * The public booking page is cached across visitors (libs/booking-page.ts).
 * An owner's edit has to show up on it straight away: the price a customer
 * sees must be the price they're charged.
 */
test("an owner's price change shows on the public page at once", async ({ page, browser }) => {
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, { name: "Cached Lawns", services: [{ name: "Weekly mow", price_cents: 4500, duration_minutes: 60 }] });

    // A visitor loads the page twice, so the second comes from the cache.
    const visitor = await (await browser.newContext()).newPage();
    for (let visit = 0; visit < 2; visit++) {
        await visitor.goto(`/l/${business.slug}`);
        await expect(visitor.getByText("$45").first()).toBeVisible();
    }

    await logIn(page, owner.email, owner.password);
    await expectOnPath(page, "/dashboard");
    await page.goto("/dashboard/services");
    const row = page.getByTestId("service-row").filter({ hasText: "Weekly mow" });
    await row.getByRole("button", { name: "Edit Weekly mow" }).click();
    const editor = page.getByTestId("service-row").filter({ has: page.getByRole("button", { name: "Save changes" }) });
    await editor.getByLabel("Price").fill("52");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByTestId("service-row").filter({ hasText: "Weekly mow" })).toContainText("$52");

    await visitor.reload();
    await expect(visitor.getByText("$52").first()).toBeVisible();
    await expect(visitor.getByText("$45")).toHaveCount(0);
});
