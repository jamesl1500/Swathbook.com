import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run the production build against this repo's local Supabase stack
 * (`pnpm db:start`), so they exercise real auth, RLS and email delivery.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const repoRoot = path.resolve(__dirname, "../..");

function localSupabase() {
    try {
        const status = JSON.parse(
            execSync("pnpm exec supabase status -o json", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString(),
        );
        return {
            url: status.API_URL as string,
            publishableKey: status.PUBLISHABLE_KEY as string,
            secretKey: status.SECRET_KEY as string,
            mailpitUrl: (status.MAILPIT_URL ?? status.INBUCKET_URL) as string,
        };
    } catch {
        throw new Error("Local Supabase isn't running. Start it with `pnpm db:start` from the repo root.");
    }
}

const supabase = localSupabase();

// Shared with the test workers (see e2e/support/env.ts).
process.env.E2E_BASE_URL = baseURL;
process.env.E2E_SUPABASE_URL = supabase.url;
process.env.E2E_SUPABASE_SECRET_KEY = supabase.secretKey;
process.env.E2E_MAILPIT_URL = supabase.mailpitUrl;

export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : 4,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
        stderr: "pipe",
        env: {
            NEXT_DIST_DIR: ".next-e2e",
            NEXT_PUBLIC_SUPABASE_URL: supabase.url,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
            SUPABASE_SECRET_KEY: supabase.secretKey,
            NEXT_PUBLIC_SITE_URL: baseURL,
            // Set (even empty) so values in .env never leak real Stripe/Google
            // calls into test runs; the app falls back to "not configured".
            STRIPE_SECRET_KEY: "",
            STRIPE_WEBHOOK_SECRET: "",
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
            GOOGLE_MAPS_API_KEY: "",
        },
    },
});
