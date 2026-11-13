import { expect, test, type Page } from "@playwright/test";
import { createBusiness, createUser } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { dashboardPaths, signInToBusyDashboard } from "./support/dashboard";

/**
 * Layout on the screens people actually hold. readability.spec.ts covers 390px
 * and desktop; this adds the smallest phones (320px is also the WCAG reflow
 * width), common Androids and tablets, where the dashboard swaps its sidebar
 * for a bottom tab bar. It also checks what phones get wrong that a desktop
 * browser won't show: fingertip-sized targets and fields that make iOS zoom.
 */
const WIDTHS = [
    { name: "small phone", width: 320, height: 640 },
    { name: "android", width: 360, height: 780 },
    { name: "tablet", width: 768, height: 1024 },
];

test.use({ reducedMotion: "reduce", hasTouch: true });

async function checkLayout(page: Page, path: string, ready: (page: Page) => Promise<void> = (p) => p.locator("h1").first().waitFor()) {
    const problems: string[] = [];
    for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await ready(page);

        const found = await page.evaluate((phone) => {
            const width = document.documentElement.clientWidth;
            const issues: string[] = [];
            const describe = (el: Element) => {
                const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 30);
                return `<${el.tagName.toLowerCase()}> "${label}"`;
            };
            const shown = (el: Element) => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && !el.closest("[hidden], [aria-hidden='true'], dialog:not([open]), .sr-only, [data-allow-overflow]");
            };

            if (document.documentElement.scrollWidth > width + 1) {
                const culprit = [...document.querySelectorAll("body *")].find((el) => shown(el) && el.getBoundingClientRect().right > width + 1);
                issues.push(`scrolls sideways (${document.documentElement.scrollWidth}px)${culprit ? ` because of ${describe(culprit)}` : ""}`);
            }

            // WCAG 2.5.8: at least 24x24 CSS px, except links inside a sentence.
            for (const el of document.querySelectorAll("a[href], button, select, input:not([type=hidden]), textarea, [role=tab], [role=switch], summary")) {
                if (!shown(el)) continue;
                const inSentence = el.tagName === "A" && el.closest("p, li") && (el.closest("p, li")!.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 3;
                if (inSentence) continue;
                const { width: w, height: h } = el.getBoundingClientRect();
                // Checkboxes and radios count their wrapping label as the target.
                const label = (el as HTMLInputElement).labels?.[0]?.getBoundingClientRect();
                const targetW = Math.max(w, label?.width ?? 0);
                const targetH = Math.max(h, label?.height ?? 0);
                if (targetW < 24 || targetH < 24) issues.push(`small tap target ${describe(el)} ${Math.round(targetW)}x${Math.round(targetH)}`);
            }

            // iOS zooms into fields under 16px and stays zoomed.
            if (phone) {
                for (const el of document.querySelectorAll("input:not([type=hidden], [type=checkbox], [type=radio], [type=file], [type=color]), select, textarea")) {
                    if (!shown(el)) continue;
                    const size = parseFloat(getComputedStyle(el).fontSize);
                    if (size < 16) issues.push(`field text ${size}px makes iOS zoom: ${describe(el)}`);
                }
            }
            return issues;
        }, size.width < 640);
        problems.push(...[...new Set(found)].slice(0, 8).map((issue) => `${size.name} (${size.width}px): ${issue}`));
    }
    expect(problems, `Mobile layout problems on ${path}`).toEqual([]);
}

test.describe("public pages on phones and tablets", () => {
    for (const path of ["/", "/features", "/industries", "/pricing", "/about", "/contact", "/privacy", "/terms", "/auth/login", "/auth/signup"]) {
        test(`${path} fits`, async ({ page }) => {
            await checkLayout(page, path);
        });
    }

    test("a business page and its booking flow fit", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Northside Leaf & Lawn Care Specialists", openEveryDay: true });
        await checkLayout(page, `/l/${business.slug}`);

        // The time picker is the densest step.
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto(`/l/${business.slug}`);
        await page.getByRole("checkbox").first().check();
        await page.getByRole("button", { name: /continue/i }).click();
        await expect(page.getByRole("heading", { name: "Pick a time" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
});

test.describe("the dashboard on phones and tablets", () => {
    test("every page fits, and the tab bar never hides the end of the page", async ({ page }) => {
        test.setTimeout(300_000);
        const job = await signInToBusyDashboard(page, { customerName: "Pat Customer With A Long Name" });

        const ready = (p: Page) => p.locator("main h1").first().waitFor();
        for (const path of dashboardPaths(job, { tabs: true })) {
            await test.step(path, () => checkLayout(page, path, ready));
        }

        // Scrolled to the bottom on a phone, the footer sits above the tab bar.
        await page.setViewportSize({ width: 360, height: 640 });
        await page.goto("/dashboard/link?tab=details");
        const save = page.getByRole("button", { name: "Save booking page" });
        await save.waitFor();
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight)).toBe(true);
        const tabBar = page.getByRole("navigation", { name: "Dashboard" }).filter({ visible: true });
        const [barBox, saveBox] = [await tabBar.boundingBox(), await save.boundingBox()];
        expect(barBox, "tab bar on screen").not.toBeNull();
        expect(saveBox!.y + saveBox!.height, "Save button clear of the tab bar").toBeLessThanOrEqual(barBox!.y);
    });

    test("on a phone, the tab bar and its More menu reach every section", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        await createBusiness(owner.id, { name: "Shine On Mobile Detailing" });
        await page.setViewportSize({ width: 360, height: 780 });
        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");

        await page.getByRole("button", { name: "More" }).click();
        const menu = page.getByRole("dialog");
        await expect(menu).toBeVisible();
        for (const name of ["Customers", "Routes", "Services", "Booking link", "Payouts", "Team", "Billing"]) {
            await expect(menu.getByRole("link", { name })).toBeVisible();
        }
        await menu.getByRole("link", { name: "Booking link" }).click();
        await expectOnPath(page, "/dashboard/link");
        await expect(menu).toBeHidden();
    });
});
