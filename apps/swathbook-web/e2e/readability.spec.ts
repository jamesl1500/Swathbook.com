import { createHash, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addJob, admin, createBusiness, createUser, memberIdFor } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { tomorrowAt } from "./support/time";

/**
 * Every screen must be readable on a phone and a laptop: WCAG AA text contrast
 * (no light text on light backgrounds) and no sideways scrolling.
 */
const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

// Entrance animations fade text in; auditing mid-fade would report false failures.
test.use({ reducedMotion: "reduce" });

async function audit(page: Page, path: string, { ready }: { ready?: (page: Page) => Promise<void> } = {}) {
  const problems: string[] = [];
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    if (ready) await ready(page);
    else await page.locator("h1").first().waitFor();

    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= width + 1) return null;
      const culprits = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.getBoundingClientRect().right > width + 1 && element.getClientRects().length)
        .filter((element) => !element.closest("[data-allow-overflow]"))
        .slice(0, 3)
        .map((element) => `<${element.tagName.toLowerCase()} class="${String(element.className).slice(0, 60)}">`);
      return { scrollWidth: document.documentElement.scrollWidth, culprits };
    });
    if (overflow) problems.push(`${size.name}: page is ${overflow.scrollWidth}px wide (> ${size.width}). ${overflow.culprits.join(", ")}`);

    // Text cut off at the screen edge (a parent with overflow:hidden hides the scroll, not the problem).
    const clipped = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const found: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || !node.textContent?.trim() || parent.closest("[data-allow-overflow], [aria-hidden='true'], dialog:not([open]), .sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.width && (rect.right > width + 1 || rect.left < -1)) found.push(`"${node.textContent.trim().slice(0, 40)}"`);
        if (found.length >= 3) break;
      }
      return found;
    });
    if (clipped.length) problems.push(`${size.name}: text runs off the screen: ${clipped.join(", ")}`);

    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        problems.push(`${size.name}: ${node.target.join(" ")}: ${node.failureSummary?.split("\n").slice(1).join(" ").trim()}`);
      }
    }
  }
  expect(problems, `Readability problems on ${path}`).toEqual([]);
}

test.describe("public pages", () => {
  for (const path of ["/", "/features", "/industries", "/pricing", "/about", "/contact", "/privacy", "/terms", "/auth/login", "/auth/signup", "/auth/forgot_password"]) {
    test(`${path} is readable`, async ({ page }) => {
      await audit(page, path);
    });
  }

  test("a business page in the default colors is readable", async ({ page }) => {
    const owner = await createUser();
    const business = await createBusiness(owner.id, { name: "Shine On Mobile Detailing", openEveryDay: true });
    await audit(page, `/l/${business.slug}`);
  });

  for (const color of ["#f2b705", "#ffffff", "#a7f3d0"]) {
    test(`a business page with a pale brand color (${color}) is readable`, async ({ page }) => {
      const owner = await createUser();
      const business = await createBusiness(owner.id, { name: "Bright Nest Cleaning", openEveryDay: true });
      await admin.from("businesses").update({ brand_color: color, description: "Homes, move-outs and deep cleans." }).eq("id", business.id);
      await audit(page, `/l/${business.slug}`);
    });
  }

  test("a customer's booking page is readable", async ({ page }) => {
    const owner = await createUser();
    const business = await createBusiness(owner.id, { name: "Fix-It Fast Plumbing" });
    await admin.from("businesses").update({ brand_color: "#f2b705" }).eq("id", business.id);
    const { bookingId } = await addJob(business.id, { start: tomorrowAt(10).at, memberId: null, customerName: "Pat Customer", lat: 30.2, lng: -97.7 });
    const { data } = await admin.from("bookings").select("public_token").eq("id", bookingId).single();
    await audit(page, `/booking/${data!.public_token}`);
  });
});

test("a team invite page is readable", async ({ page }) => {
  const owner = await createUser({ fullName: "Olive Owner" });
  const business = await createBusiness(owner.id, { name: "Shine On Detailing" });
  const token = randomBytes(32).toString("hex");
  await admin.from("business_invitations").insert({
    business_id: business.id,
    email: "crew@example.com",
    role: "crew",
    token_hash: createHash("sha256").update(token).digest("hex"),
  });
  await audit(page, `/invite/${token}`);
});

test.describe("signed-in pages", () => {
  test("onboarding is readable", async ({ page }) => {
    const user = await createUser({ fullName: "New Owner" });
    await logIn(page, user.email, user.password);
    await expectOnPath(page, "/onboarding");
    await audit(page, "/onboarding");
  });

  test("every dashboard page is readable", async ({ page }) => {
    test.setTimeout(240_000);
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, { name: "Shine On Mobile Detailing", openEveryDay: true });
    const { bookingId, customerId } = await addJob(business.id, {
      start: tomorrowAt(10).at,
      memberId: await memberIdFor(business.id, owner.id),
      customerName: "Pat Customer",
      lat: 30.2,
      lng: -97.7,
    });
    // Near the end of the trial, so the billing banner is audited on every page.
    await admin.from("businesses").update({ trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() }).eq("id", business.id);
    await logIn(page, owner.email, owner.password);
    await expectOnPath(page, "/dashboard");

    const main = { ready: (p: Page) => p.locator("main h1").first().waitFor() };
    for (const path of [
      "/dashboard",
      `/dashboard/schedule?week=${tomorrowAt(10).date}`,
      `/dashboard/schedule/${bookingId}`,
      "/dashboard/schedule/new",
      "/dashboard/schedule/availability",
      "/dashboard/customers",
      `/dashboard/customers/${customerId}`,
      "/dashboard/customers/new",
      `/dashboard/routes?date=${tomorrowAt(10).date}`,
      "/dashboard/services",
      "/dashboard/link",
      "/dashboard/payouts",
      "/dashboard/account",
      "/dashboard/team",
      "/dashboard/bookings",
      "/dashboard/billing",
    ]) {
      await audit(page, path, main);
    }
  });
});
