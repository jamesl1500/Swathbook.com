// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    hasEnv: true,
    userId: null as string | null,
    refreshedCookie: null as string | null,
}));

vi.mock("@/libs/supabase/env", () => ({ hasSupabaseEnv: () => state.hasEnv }));
vi.mock("@/libs/supabase/proxy", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/libs/supabase/proxy")>()),
    updateSession: vi.fn(async (request: NextRequest) => {
        const response = NextResponse.next({ request });
        if (state.refreshedCookie) {
            response.cookies.set("sb-auth-token", state.refreshedCookie);
            response.headers.set("Cache-Control", "private, no-store");
        }
        return { response, userId: state.userId };
    }),
}));

import { proxy } from "./proxy";

function request(path: string) {
    return proxy(new NextRequest(`http://localhost:3000${path}`));
}

function locationOf(response: Response) {
    const location = response.headers.get("location");
    if (!location) return null;
    const url = new URL(location);
    return `${url.pathname}${url.search}`;
}

beforeEach(() => {
    state.hasEnv = true;
    state.userId = null;
    state.refreshedCookie = null;
});

describe("proxy", () => {
    it("lets everything through before Supabase is configured", async () => {
        state.hasEnv = false;
        expect(locationOf(await request("/dashboard"))).toBeNull();
    });

    it.each(["/", "/pricing", "/auth/login", "/auth/verify_email"])("lets signed-out visitors see %s", async (path) => {
        expect(locationOf(await request(path))).toBeNull();
    });

    it.each([
        ["/dashboard", "/auth/login?next=%2Fdashboard"],
        ["/onboarding", "/auth/login?next=%2Fonboarding"],
        ["/onboarding?new=1", "/auth/login?next=%2Fonboarding%3Fnew%3D1"],
        ["/dashboard/settings", "/auth/login?next=%2Fdashboard%2Fsettings"],
    ])("sends signed-out visitors from %s to login, remembering where they were going", async (path, expected) => {
        expect(locationOf(await request(path))).toBe(expected);
    });

    it.each(["/auth/login", "/auth/signup", "/auth/forgot_password"])("skips %s for signed-in users", async (path) => {
        state.userId = "u1";
        expect(locationOf(await request(path))).toBe("/dashboard");
    });

    it.each(["/auth/reset_password", "/auth/verify_email", "/dashboard", "/onboarding"])(
        "lets signed-in users reach %s",
        async (path) => {
            state.userId = "u1";
            expect(locationOf(await request(path))).toBeNull();
        },
    );

    it("keeps refreshed session cookies and no-cache headers on redirects", async () => {
        state.userId = "u1";
        state.refreshedCookie = "fresh-token";
        const response = await request("/auth/login");
        expect(locationOf(response)).toBe("/dashboard");
        expect(response.headers.get("set-cookie")).toContain("sb-auth-token=fresh-token");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
});
