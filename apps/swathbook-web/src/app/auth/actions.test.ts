// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    headers: new Headers(),
    postAuthPath: "/dashboard",
}));

vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => state.headers) }));
vi.mock("@/libs/auth", () => ({ getPostAuthPath: vi.fn(async () => state.postAuthPath) }));

import { requestPasswordReset, resendVerification, signIn, signOut, signUp, updatePassword } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.headers = new Headers({ origin: "http://localhost:3000" });
    state.postAuthPath = "/dashboard";
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
});

describe("signIn", () => {
    it("returns field errors without calling Supabase when input is invalid", async () => {
        const result = await signIn({}, form({ email: "nope", password: "" }));
        expect(result.fieldErrors).toEqual({ email: ["Enter a valid email address."], password: ["Enter your password."] });
        expect(result.values).toEqual({ email: "nope" });
        expect(state.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("gives one generic message for a wrong email or password", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "x" } });
        const result = await signIn({}, form({ email: "dana@example.com", password: "wrong-pass" }));
        expect(result.error).toMatch(/don't match/);
        expect(result.values).toEqual({ email: "dana@example.com" });
    });

    it("signs in with a normalized email and goes to the post-auth destination", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        state.postAuthPath = "/onboarding";
        await expectRedirect(signIn({}, form({ email: " Dana@Example.com ", password: "secret-pass" })), "/onboarding");
        expect(state.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "dana@example.com", password: "secret-pass" });
    });

    it("honors a safe ?next= path", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        await expectRedirect(signIn({}, form({ email: "dana@example.com", password: "secret-pass", next: "/onboarding?new=1" })), "/onboarding?new=1");
    });

    it("ignores an off-site ?next= path", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        await expectRedirect(signIn({}, form({ email: "dana@example.com", password: "secret-pass", next: "//evil.example" })), "/dashboard");
    });

    it("sends unconfirmed users to verify their email", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "email_not_confirmed", message: "x" } });
        await expectRedirect(signIn({}, form({ email: "dana@example.com", password: "secret-pass" })), "/auth/verify_email?email=dana%40example.com");
    });

    it("explains rate limits", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "over_request_rate_limit", message: "x" } });
        const result = await signIn({}, form({ email: "dana@example.com", password: "secret-pass" }));
        expect(result.error).toMatch(/Too many attempts/);
    });
});

describe("signUp", () => {
    const valid = { fullName: "Dana Field", email: "Dana@Example.com", password: "long-enough", slug: "Green-Acres" };

    it("returns field errors and echoes values (never the password)", async () => {
        const result = await signUp({}, form({ fullName: "", email: "bad", password: "short" }));
        expect(Object.keys(result.fieldErrors ?? {})).toEqual(["fullName", "email", "password"]);
        expect(result.values).toEqual({ fullName: "", email: "bad", slug: "" });
        expect(state.supabase.auth.signUp).not.toHaveBeenCalled();
    });

    it("creates the account with the claimed slug and a confirm link, then asks to verify", async () => {
        state.supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
        await expectRedirect(signUp({}, form(valid)), "/auth/verify_email?email=dana%40example.com");
        expect(state.supabase.auth.signUp).toHaveBeenCalledWith({
            email: "dana@example.com",
            password: "long-enough",
            options: {
                emailRedirectTo: "http://localhost:3000/auth/confirm?next=%2Fonboarding",
                data: { full_name: "Dana Field", desired_slug: "green-acres" },
            },
        });
    });

    it("goes straight to onboarding when confirmation is off", async () => {
        state.supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
        await expectRedirect(signUp({}, form(valid)), "/onboarding");
    });

    it("prefers the configured site URL over request headers for email links", async () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.swathbook.com/");
        state.headers = new Headers({ origin: "https://evil.example" });
        state.supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
        await expectRedirect(signUp({}, form(valid)), "/auth/verify_email?email=dana%40example.com");
        expect(state.supabase.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
            "https://www.swathbook.com/auth/confirm?next=%2Fonboarding",
        );
    });

    it("falls back to the forwarded host when there's no origin header", async () => {
        state.headers = new Headers({ "x-forwarded-host": "preview.swathbook.com", "x-forwarded-proto": "https" });
        state.supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
        await expectRedirect(signUp({}, form(valid)), "/auth/verify_email?email=dana%40example.com");
        expect(state.supabase.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
            "https://preview.swathbook.com/auth/confirm?next=%2Fonboarding",
        );
    });

    it("stores no slug when none was claimed", async () => {
        state.supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
        await expectRedirect(signUp({}, form({ ...valid, slug: "" })), "/auth/verify_email?email=dana%40example.com");
        expect(state.supabase.auth.signUp.mock.calls[0][0].options.data.desired_slug).toBeNull();
    });

    it.each([
        ["user_already_exists", /already an account/],
        ["over_email_send_rate_limit", /Too many sign-up attempts/],
        ["unexpected_failure", /couldn't create your account/],
    ])("maps %s to a friendly error", async (code, message) => {
        state.supabase.auth.signUp.mockResolvedValue({ data: {}, error: { code, message: "x" } });
        const result = await signUp({}, form(valid));
        expect(result.error).toMatch(message);
    });

    it("shows weak-password feedback on the password field", async () => {
        state.supabase.auth.signUp.mockResolvedValue({ data: {}, error: { code: "weak_password", message: "Password is too common" } });
        const result = await signUp({}, form(valid));
        expect(result.fieldErrors).toEqual({ password: ["Password is too common"] });
    });
});

describe("requestPasswordReset", () => {
    it("sends a recovery link that lands on the reset page", async () => {
        const result = await requestPasswordReset({}, form({ email: "Dana@Example.com" }));
        expect(state.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("dana@example.com", {
            redirectTo: "http://localhost:3000/auth/confirm?next=/auth/reset_password",
        });
        expect(result.success).toMatch(/reset link is on its way/);
    });

    it("answers the same way when the account doesn't exist", async () => {
        state.supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { code: "user_not_found", message: "x" } });
        const result = await requestPasswordReset({}, form({ email: "ghost@example.com" }));
        expect(result.success).toMatch(/If there's an account for ghost@example.com/);
        expect(result.error).toBeUndefined();
    });

    it("explains rate limits", async () => {
        state.supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", message: "x" } });
        const result = await requestPasswordReset({}, form({ email: "dana@example.com" }));
        expect(result.error).toMatch(/Wait a minute/);
    });

    it("validates the email", async () => {
        const result = await requestPasswordReset({}, form({ email: "nope" }));
        expect(result.fieldErrors?.email).toBeDefined();
        expect(state.supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });
});

describe("updatePassword", () => {
    it("checks the passwords match before calling Supabase", async () => {
        const result = await updatePassword({}, form({ password: "new-password", confirmPassword: "other-password" }));
        expect(result.fieldErrors).toEqual({ confirmPassword: ["Passwords don't match."] });
        expect(state.supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it("updates the password and continues into the app", async () => {
        state.supabase.auth.updateUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        await expectRedirect(updatePassword({}, form({ password: "new-password", confirmPassword: "new-password" })), "/dashboard");
        expect(state.supabase.auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    });

    it("explains an expired recovery session", async () => {
        state.supabase.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: "session_not_found", message: "x" } });
        const result = await updatePassword({}, form({ password: "new-password", confirmPassword: "new-password" }));
        expect(result.error).toMatch(/expired/);
    });

    it("rejects reusing the old password", async () => {
        state.supabase.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: "same_password", message: "x" } });
        const result = await updatePassword({}, form({ password: "new-password", confirmPassword: "new-password" }));
        expect(result.fieldErrors?.password?.[0]).toMatch(/haven't used before/);
    });
});

describe("resendVerification", () => {
    it("resends the signup email", async () => {
        const result = await resendVerification({}, form({ email: "dana@example.com" }));
        expect(state.supabase.auth.resend).toHaveBeenCalledWith({
            type: "signup",
            email: "dana@example.com",
            options: { emailRedirectTo: "http://localhost:3000/auth/confirm?next=/onboarding" },
        });
        expect(result.success).toBe("Sent a fresh link to dana@example.com.");
    });

    it("reports failures", async () => {
        state.supabase.auth.resend.mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", message: "x" } });
        const result = await resendVerification({}, form({ email: "dana@example.com" }));
        expect(result.error).toMatch(/Give it a minute/);
    });
});

describe("signOut", () => {
    it("ends the session and returns to login", async () => {
        await expectRedirect(signOut(), "/auth/login");
        expect(state.supabase.auth.signOut).toHaveBeenCalled();
    });
});
