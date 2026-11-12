// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    user: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
    createClient: vi.fn(),
}));

vi.mock("./supabase/env", () => ({
    hasSupabaseEnv: () => true,
    getSupabaseEnv: () => ({ url: "http://supabase.test", publishableKey: "pk" }),
}));
vi.mock("@supabase/supabase-js", () => ({
    createClient: state.createClient.mockImplementation(() => ({
        auth: { getUser: vi.fn(async () => ({ data: { user: state.user }, error: state.error })) },
    })),
}));

import { appPreflight, authenticateApp } from "./app-api";

function request(authorization?: string) {
    return new Request("http://localhost/api/app/bookings", { headers: authorization ? { authorization } : {} });
}

async function errorOf(result: Awaited<ReturnType<typeof authenticateApp>>) {
    if (!("response" in result)) throw new Error("expected an error response");
    return { status: result.response.status, body: await result.response.json() };
}

beforeEach(() => {
    state.user = { id: "u1", email: "cara@example.com", email_confirmed_at: "2026-11-01T00:00:00Z" };
    state.error = null;
    state.createClient.mockClear();
});

describe("authenticateApp", () => {
    it("asks for sign-in without a bearer token", async () => {
        expect(await errorOf(await authenticateApp(request()))).toEqual({
            status: 401,
            body: { code: "unauthenticated", error: "Sign in to continue." },
        });
    });

    it("rejects tokens Supabase Auth won't vouch for", async () => {
        state.user = null;
        state.error = { message: "invalid JWT" };
        expect((await errorOf(await authenticateApp(request("Bearer bad")))).status).toBe(401);
    });

    it("needs a confirmed email, which is what links a login to bookings", async () => {
        state.user = { id: "u1", email: "cara@example.com", email_confirmed_at: null };
        expect(await errorOf(await authenticateApp(request("Bearer t")))).toMatchObject({ status: 403, body: { code: "email_unconfirmed" } });
    });

    it("returns the user and a client acting as them", async () => {
        const result = await authenticateApp(request("Bearer abc.def"));
        expect(result).toMatchObject({ user: { id: "u1", email: "cara@example.com" } });
        expect(state.createClient).toHaveBeenCalledWith(
            "http://supabase.test",
            "pk",
            expect.objectContaining({ global: { headers: { Authorization: "Bearer abc.def" } } }),
        );
    });
});

describe("appPreflight", () => {
    it("allows the app's web build to send its token", () => {
        const response = appPreflight();
        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    });
});
