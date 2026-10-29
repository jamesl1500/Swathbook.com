// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));

import { GET } from "./route";

async function visit(query: string) {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
    const location = new URL(response.headers.get("location")!);
    return `${location.pathname}${location.search}`;
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
});

describe("GET /auth/confirm", () => {
    it("verifies a signup token and continues to onboarding", async () => {
        expect(await visit("token_hash=abc&type=email&next=/onboarding")).toBe("/onboarding");
        expect(state.supabase.auth.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    });

    it("verifies a recovery token and continues to the reset page", async () => {
        expect(await visit("token_hash=abc&type=recovery&next=/auth/reset_password")).toBe("/auth/reset_password");
        expect(state.supabase.auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    });

    it("supports the PKCE ?code= flow", async () => {
        expect(await visit("code=xyz&next=/onboarding")).toBe("/onboarding");
        expect(state.supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
    });

    it("defaults to onboarding and refuses off-site next paths", async () => {
        expect(await visit("token_hash=abc&type=email&next=//evil.example")).toBe("/onboarding");
    });

    it("sends failed signup links back to verify email", async () => {
        state.supabase.auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: "expired" } });
        expect(await visit("token_hash=abc&type=email&next=/onboarding")).toBe("/auth/verify_email?error=link_expired");
    });

    it("sends failed recovery links back to forgot password", async () => {
        state.supabase.auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: "expired" } });
        expect(await visit("token_hash=abc&type=recovery&next=/auth/reset_password")).toBe("/auth/forgot_password?error=link_expired");
    });

    it("confirms an email change and returns to account settings", async () => {
        expect(await visit("token_hash=abc&type=email_change&next=/dashboard/account")).toBe("/dashboard/account");
    });

    it("sends failed email-change links back to account settings", async () => {
        state.supabase.auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: "expired" } });
        expect(await visit("token_hash=abc&type=email_change&next=/dashboard/account")).toBe("/dashboard/account?error=link_expired");
    });

    it("treats a failed code exchange for the reset page as a recovery failure", async () => {
        state.supabase.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: { message: "bad code" } });
        expect(await visit("code=xyz&next=/auth/reset_password")).toBe("/auth/forgot_password?error=link_expired");
    });

    it("rejects links with no token at all", async () => {
        expect(await visit("next=/onboarding")).toBe("/auth/verify_email?error=link_expired");
        expect(state.supabase.auth.verifyOtp).not.toHaveBeenCalled();
    });
});
