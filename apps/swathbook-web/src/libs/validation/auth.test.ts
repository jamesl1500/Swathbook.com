import { describe, expect, it } from "vitest";
import { z } from "zod";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "./auth";

function fieldErrors(result: { success: boolean; error?: z.ZodError }) {
    return result.error ? z.flattenError(result.error).fieldErrors : {};
}

describe("signInSchema", () => {
    it("normalizes the email", () => {
        const result = signInSchema.parse({ email: "  Dana@Example.COM ", password: "x" });
        expect(result.email).toBe("dana@example.com");
    });

    it("requires a valid email and a password", () => {
        const result = signInSchema.safeParse({ email: "nope", password: "" });
        expect(fieldErrors(result)).toEqual({
            email: ["Enter a valid email address."],
            password: ["Enter your password."],
        });
    });
});

describe("signUpSchema", () => {
    const valid = { fullName: "Dana Field", email: "dana@example.com", password: "long-enough" };

    it("accepts a complete signup", () => {
        expect(signUpSchema.safeParse(valid).success).toBe(true);
    });

    it("lowercases an optional claimed slug", () => {
        expect(signUpSchema.parse({ ...valid, slug: "GreenAcres" }).slug).toBe("greenacres");
    });

    it("rejects short passwords and names", () => {
        const result = signUpSchema.safeParse({ ...valid, fullName: "D", password: "short" });
        expect(fieldErrors(result)).toEqual({
            fullName: ["Tell us your name."],
            password: ["Use at least 8 characters."],
        });
    });

    it("rejects passwords over bcrypt's 72-byte limit", () => {
        expect(signUpSchema.safeParse({ ...valid, password: "x".repeat(73) }).success).toBe(false);
    });
});

describe("forgotPasswordSchema", () => {
    it("requires a valid email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
        expect(forgotPasswordSchema.safeParse({ email: "a@b" }).success).toBe(false);
    });
});

describe("resetPasswordSchema", () => {
    it("requires matching passwords", () => {
        const result = resetPasswordSchema.safeParse({ password: "new-password", confirmPassword: "different" });
        expect(fieldErrors(result)).toEqual({ confirmPassword: ["Passwords don't match."] });
    });

    it("accepts matching passwords", () => {
        expect(resetPasswordSchema.safeParse({ password: "new-password", confirmPassword: "new-password" }).success).toBe(true);
    });
});
