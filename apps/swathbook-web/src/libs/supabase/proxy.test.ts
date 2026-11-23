// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    createServerClient: vi.fn(),
    getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: state.createServerClient }));
vi.mock("./env", () => ({ getSupabaseEnv: () => ({ url: "https://project.supabase.test", publishableKey: "publishable" }) }));

import { updateSession } from "./proxy";

const request = (cookie?: string) => new NextRequest("https://swathbook.test/pricing", cookie ? { headers: { cookie } } : undefined);

beforeEach(() => {
    state.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u1" } } });
    state.createServerClient.mockReset().mockReturnValue({ auth: { getClaims: state.getClaims } });
});

describe("updateSession", () => {
    it.each([undefined, "swathbook_business=b1; _ga=GA1.1.1"])("does no auth work without a session cookie (%s)", async (cookie) => {
        const { userId } = await updateSession(request(cookie));
        expect(userId).toBeNull();
        expect(state.createServerClient).not.toHaveBeenCalled();
    });

    it.each(["sb-project-auth-token=token", "sb-project-auth-token.0=part; sb-project-auth-token.1=part"])("checks the session for %s", async (cookie) => {
        const { userId } = await updateSession(request(cookie));
        expect(userId).toBe("u1");
        expect(state.getClaims).toHaveBeenCalledOnce();
    });
});
