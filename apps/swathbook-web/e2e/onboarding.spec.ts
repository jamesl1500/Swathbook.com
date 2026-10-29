import { expect, test, type Page } from "@playwright/test";
import { createBusiness, createUser, getBusinessBySlug } from "./support/admin";
import { chooseTrade, expectOnPath, logIn } from "./support/auth";
import { uniqueSlug } from "./support/data";

const continueButton = (page: Page) => page.getByRole("button", { name: "Continue" });

/** Runs the wizard with sensible answers; returns the slug it launched with. */
async function completeWizard(page: Page, { name, slug }: { name: string; slug: string }) {
    await page.getByLabel("Business name").fill(name);
    await chooseTrade(page, "Lawn mowing");
    await continueButton(page).click();

    await page.getByLabel("Your booking link").fill(slug);
    await continueButton(page).click();

    await expect(page.getByRole("heading", { name: "What do you offer?" })).toBeVisible();
    await continueButton(page).click();

    await page.getByLabel("Where does your day start?").fill("1 Main St, Austin");
    await continueButton(page).click();

    await page.getByRole("button", { name: /Launch my booking page/ }).click();
    await expectOnPath(page, "/dashboard");
    await expect(page.getByRole("heading", { name: `${name} is ready for bookings` })).toBeVisible();
}

test.describe("onboarding", () => {
    test("a new owner sets up their business and goes live", async ({ page }) => {
        const user = await createUser();
        const slug = uniqueSlug("green-acres");
        await logIn(page, user.email, user.password);
        await expectOnPath(page, "/onboarding");

        // Step 1 won't continue empty.
        await continueButton(page).click();
        await expect(page.getByText("Enter your business name.")).toBeVisible();
        await expect(page.getByText("Pick the kind of work you do.")).toBeVisible();

        await page.getByLabel("Business name").fill("Green Acres Lawn");
        await chooseTrade(page, "Lawn mowing");
        await page.getByLabel(/Business phone/).fill("512-555-0100");
        // The live preview follows along.
        await expect(page.getByRole("complementary", { name: "Booking page preview" })).toContainText("Green Acres Lawn");
        await continueButton(page).click();

        // Step 2: suggested from the name; pick our own unique one.
        await expect(page.getByLabel("Your booking link")).toHaveValue("green-acres-lawn");
        await page.getByLabel("Your booking link").fill(slug);
        await continueButton(page).click();

        // Step 3: starter menu for lawn care; adjust it.
        await expect(page.getByRole("heading", { name: "What do you offer?" })).toBeVisible();
        await expect(page.getByLabel("Service name")).toHaveCount(3);
        await page.getByLabel("Price in dollars").first().fill("50");
        await page.getByRole("button", { name: "Remove One-time cut" }).click();
        await page.getByRole("button", { name: "Add a service" }).click();
        await page.getByLabel("Service name").last().fill("Gutter clean");
        await continueButton(page).click();

        // Step 4
        await continueButton(page).click();
        await expect(page.getByText("Enter the address your day starts from.")).toBeVisible();
        await page.getByLabel("Where does your day start?").fill("1 Main St, Austin");
        await page.getByRole("button", { name: "Sat" }).click();
        await continueButton(page).click();

        // Step 5: review
        await expect(page.getByRole("heading", { name: "Look good? Let's go live." })).toBeVisible();
        await expect(page.locator("form").getByText(`swathbook.com/l/${slug}`)).toBeVisible();
        await expect(page.getByText("3 services")).toBeVisible();
        await page.getByRole("button", { name: /Launch my booking page/ }).click();

        await expectOnPath(page, "/dashboard");
        await expect(page.getByRole("heading", { name: "Green Acres Lawn is ready for bookings" })).toBeVisible();
        await expect(page.getByTestId("booking-link")).toHaveText(`swathbook.com/l/${slug}`);

        // What actually landed in the database.
        const saved = await getBusinessBySlug(slug);
        expect(saved).toMatchObject({ name: "Green Acres Lawn", owner_id: user.id, is_published: true });
        expect(saved?.onboarding_completed_at).not.toBeNull();
        expect(saved?.services.map((service) => [service.name, service.price_cents, service.deposit_type]).sort()).toEqual(
            [
                ["Gutter clean", 5000, "percent"],
                ["Overgrown yard reset", 15000, "percent"],
                ["Weekly mow, edge & blow", 5000, "none"],
            ].sort(),
        );
        expect(saved?.business_hours.map((hour) => hour.weekday).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test("a link someone else owns is rejected on the link step", async ({ page }) => {
        const rival = await createUser({ fullName: "Rival" });
        const taken = await createBusiness(rival.id, { slug: uniqueSlug("taken") });
        const user = await createUser();
        await logIn(page, user.email, user.password);

        await page.getByLabel("Business name").fill("Copycat Lawns");
        await chooseTrade(page, "Lawn mowing");
        await continueButton(page).click();
        await page.getByLabel("Your booking link").fill(taken.slug);
        await continueButton(page).click();

        await expect(page.getByText("Someone already has that link. Try another.")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Pick your booking link" })).toBeVisible();
    });

    test("an unfinished setup is resumed instead of starting over", async ({ page }) => {
        const user = await createUser();
        const draft = await createBusiness(user.id, { name: "Half Done Detailing", live: false });
        await logIn(page, user.email, user.password);

        await expectOnPath(page, "/onboarding");
        await expect(page.getByLabel("Business name")).toHaveValue("Half Done Detailing");
        await chooseTrade(page, "Mobile detailing");
        await continueButton(page).click();
        await expect(page.getByLabel("Your booking link")).toHaveValue(draft.slug);
        // Its own link isn't "taken" by itself.
        await continueButton(page).click();
        await expect(page.getByRole("heading", { name: "What do you offer?" })).toBeVisible();
    });

    test("owners with a live business skip onboarding", async ({ page }) => {
        const user = await createUser();
        await createBusiness(user.id);
        await logIn(page, user.email, user.password);
        await expectOnPath(page, "/dashboard");

        await page.goto("/onboarding");
        await expectOnPath(page, "/dashboard");
    });
});

test.describe("multiple businesses", () => {
    test("an owner adds a second business and switches between them", async ({ page }) => {
        const user = await createUser();
        const first = await createBusiness(user.id, { name: "First Lawn Co" });
        await logIn(page, user.email, user.password);
        await expect(page.getByRole("heading", { name: "First Lawn Co is ready for bookings" })).toBeVisible();

        await page.getByRole("link", { name: "Add a business" }).click();
        await expectOnPath(page, "/onboarding");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Let's add another business");

        const secondSlug = uniqueSlug("second");
        await completeWizard(page, { name: "Second Shine Detailing", slug: secondSlug });

        // The new business is active; both are in the switcher.
        await page.getByRole("button", { name: /Switch business/ }).click();
        const menu = page.getByRole("menu", { name: "Your businesses" });
        await expect(menu.getByRole("menuitemradio")).toHaveCount(2);
        await expect(menu.getByRole("menuitemradio", { name: /Second Shine Detailing/ })).toHaveAttribute("aria-checked", "true");

        await menu.getByRole("menuitemradio", { name: /First Lawn Co/ }).click();
        await expect(page.getByRole("heading", { name: "First Lawn Co is ready for bookings" })).toBeVisible();
        await expect(page.getByTestId("booking-link")).toHaveText(`swathbook.com/l/${first.slug}`);

        // The choice sticks across visits.
        await page.reload();
        await expect(page.getByRole("heading", { name: "First Lawn Co is ready for bookings" })).toBeVisible();

        // Both belong to the same owner.
        expect((await getBusinessBySlug(secondSlug))?.owner_id).toBe(user.id);
    });
});
