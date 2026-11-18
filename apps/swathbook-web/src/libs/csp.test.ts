import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp";

function directives(policy: string) {
    return Object.fromEntries(
        policy.split("; ").map((part) => {
            const [name, ...values] = part.split(" ");
            return [name, values];
        }),
    );
}

describe("buildContentSecurityPolicy", () => {
    const production = directives(buildContentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co" }));

    it("lets scripts, frames and connections reach only this site, Supabase and Stripe", () => {
        expect(production["default-src"]).toEqual(["'self'"]);
        expect(production["script-src"]).toEqual(expect.arrayContaining(["'self'", "https://js.stripe.com"]));
        expect(production["script-src"]).not.toContain("'unsafe-eval'");
        expect(production["connect-src"]).toEqual(expect.arrayContaining(["https://abc.supabase.co", "wss://abc.supabase.co", "https://api.stripe.com"]));
        expect(production["frame-src"]).toEqual(expect.arrayContaining(["https://js.stripe.com", "https://hooks.stripe.com"]));
        expect(production["img-src"]).toEqual(expect.arrayContaining(["https://abc.supabase.co", "data:", "https://maps.gstatic.com"]));
    });

    it("locks down plugins, base URLs, form posts and framing", () => {
        expect(production["object-src"]).toEqual(["'none'"]);
        expect(production["base-uri"]).toEqual(["'self'"]);
        expect(production["form-action"]).toEqual(["'self'", "https://checkout.stripe.com", "https://billing.stripe.com", "https://connect.stripe.com"]);
        expect(production["frame-ancestors"]).toEqual(["'self'"]);
        expect(production).toHaveProperty("upgrade-insecure-requests");
    });

    it("allows eval in development and plain http for local Supabase", () => {
        const dev = directives(buildContentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321", dev: true }));
        expect(dev["script-src"]).toContain("'unsafe-eval'");
        expect(dev["connect-src"]).toEqual(expect.arrayContaining(["http://127.0.0.1:54321", "ws://127.0.0.1:54321"]));
        expect(dev).not.toHaveProperty("upgrade-insecure-requests");

        // A production build against local Supabase (the E2E setup) mustn't upgrade its http images.
        expect(directives(buildContentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321" }))).not.toHaveProperty("upgrade-insecure-requests");
    });

    it("still builds without Supabase configured", () => {
        expect(directives(buildContentSecurityPolicy({ supabaseUrl: "not a url" }))["connect-src"]).toContain("'self'");
    });
});
