import { describe, expect, it } from "vitest";
import { guestOnlyPaths, matchesPath, protectedPaths, routes, safeNextPath } from "./routes";

describe("safeNextPath", () => {
    it.each(["/dashboard", "/onboarding?new=1", "/auth/reset_password", "/"])("allows same-site path %s", (path) => {
        expect(safeNextPath(path)).toBe(path);
    });

    it.each([
        ["protocol-relative URL", "//evil.example/steal"],
        ["backslash trick", "/\\evil.example"],
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
