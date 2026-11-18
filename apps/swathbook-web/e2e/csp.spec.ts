import { expect, test, type Page } from "@playwright/test";
import { createBusiness, createUser } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";

/**
 * The Content-Security-Policy (src/libs/csp.ts) must not block anything the
 * site itself uses: pages record every violation the browser reports.
 */
async function watchViolations(page: Page) {
    const violations: string[] = [];
    page.on("console", (message) => {
        if (/Content Security Policy/i.test(message.text())) violations.push(`${new URL(page.url()).pathname}: ${message.text()}`);
    });
    await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
            const where = event.sourceFile ? ` in ${event.sourceFile}:${event.lineNumber}` : "";
            console.error(`Content Security Policy violation: ${event.violatedDirective} blocked ${event.blockedURI}${where}`);
        });
    });
    return violations;
}

test.describe("content security policy", () => {
    test("is sent with every page and blocks nothing the site uses", async ({ page }) => {
        const violations = await watchViolations(page);
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Policy Lawns", openEveryDay: true });

        const response = await page.goto("/");
        const policy = response?.headers()["content-security-policy"] ?? "";
        expect(policy).toContain("default-src 'self'");
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("https://js.stripe.com");

        for (const path of ["/features", "/pricing", `/l/${business.slug}`]) {
            await page.goto(path);
            await page.waitForLoadState("networkidle");
        }
        await expect(page.getByRole("heading", { level: 1, name: "Policy Lawns" })).toBeVisible();

        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        // The notification bell keeps a realtime socket to Supabase open here.
        for (const path of ["/dashboard", "/dashboard/schedule", "/dashboard/schedule/rain", "/dashboard/link", "/dashboard/services", "/dashboard/customers"]) {
            await page.goto(path);
            await page.waitForLoadState("networkidle");
        }

        expect(violations).toEqual([]);
    });
});
