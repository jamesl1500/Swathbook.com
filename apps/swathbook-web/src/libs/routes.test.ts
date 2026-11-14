import { describe, expect, it } from "vitest";
import { customerGuestOnlyPaths, customerJobPath, customerPaths, guestOnlyPaths, matchesPath, protectedPaths, routes, safeNextPath, tradeDirectoryPath } from "./routes";

describe("safeNextPath", () => {
    it.each(["/dashboard", "/onboarding?new=1", "/auth/reset_password", "/"])("allows same-site path %s", (path) => {
        expect(safeNextPath(path)).toBe(path);
    });

    it.each([
        ["protocol-relative URL", "//evil.example/steal"],
        ["backslash trick", "/\\evil.example"],
        ["tab before the slash", "/\t/evil.example"],
        ["newline before the slash", "/\n/evil.example"],
        ["carriage return and backslash", "/\r\\evil.example"],
        ["absolute URL", "https://evil.example"],
        ["relative path", "dashboard"],
        ["empty string", ""],
    ])("rejects %s", (_label, value) => {
        expect(safeNextPath(value)).toBeNull();
    });

    it.each([null, undefined, 42, {}])("rejects non-string %s", (value) => {
        expect(safeNextPath(value)).toBeNull();
    });
});

describe("matchesPath", () => {
    it("matches exact paths and their children", () => {
        expect(matchesPath("/dashboard", protectedPaths)).toBe(true);
        expect(matchesPath("/dashboard/settings", protectedPaths)).toBe(true);
        expect(matchesPath("/onboarding", protectedPaths)).toBe(true);
    });

    it("doesn't match lookalike prefixes", () => {
        expect(matchesPath("/dashboards", protectedPaths)).toBe(false);
        expect(matchesPath("/onboarding-guide", protectedPaths)).toBe(false);
    });

    it("treats login, signup and forgot password as guest-only, but not reset or verify", () => {
        expect(matchesPath(routes.login, guestOnlyPaths)).toBe(true);
        expect(matchesPath(routes.signup, guestOnlyPaths)).toBe(true);
        expect(matchesPath(routes.forgotPassword, guestOnlyPaths)).toBe(true);
        // A recovery session is signed in, so reset must stay reachable.
        expect(matchesPath(routes.resetPassword, guestOnlyPaths)).toBe(false);
        expect(matchesPath(routes.verifyEmail, guestOnlyPaths)).toBe(false);
    });
});

describe("businessPagePath", () => {
    it("puts booking links under /l/ so they never shadow a page", async () => {
        const { businessPagePath } = await import("./routes");
        expect(businessPagePath("shine-on")).toBe("/l/shine-on");
    });
});

describe("customer paths", () => {
    it("covers the customer area, with sign-in as its guest-only page", () => {
        expect(matchesPath("/my", customerPaths)).toBe(true);
        expect(matchesPath("/my/jobs/123", customerPaths)).toBe(true);
        expect(matchesPath("/myself", customerPaths)).toBe(false);
        expect(matchesPath(routes.customerSignIn, customerGuestOnlyPaths)).toBe(true);
        expect(matchesPath(routes.customerJobs, customerGuestOnlyPaths)).toBe(false);
    });

    it("builds job and directory paths", () => {
        expect(customerJobPath("abc")).toBe("/my/jobs/abc");
        expect(tradeDirectoryPath("lawn-care")).toBe("/businesses/lawn-care");
    });
});
