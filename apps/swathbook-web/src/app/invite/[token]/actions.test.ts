// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieJar, expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";
const INVITATION_ID = "0b6b0a56-2d0f-4c3e-9f0a-6a1d2c3b4e5f";
const TOKEN = "ab".repeat(32);

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    cookies: null as unknown as ReturnType<typeof import("@/test/next-mocks").createCookieJar>,
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => state.cookies) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));

import { ACTIVE_BUSINESS_COOKIE } from "@/libs/active-business";
import { joinInvitedBusiness } from "@/app/onboarding/invite-actions";
import { acceptInvite } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.cookies = createCookieJar();
});

describe("acceptInvite (from the emailed link)", () => {
    it("joins the team and opens the dashboard on that business", async () => {
        state.supabase.rpc.mockResolvedValue({ data: BUSINESS_ID, error: null });
        await expectRedirect(acceptInvite({}, form({ token: TOKEN })), "/dashboard");
        expect(state.supabase.rpc).toHaveBeenCalledWith("accept_business_invitation", { p_token: TOKEN });
        expect(state.cookies.values.get(ACTIVE_BUSINESS_COOKIE)).toBe(BUSINESS_ID);
    });

    it("rejects malformed tokens without asking the database", async () => {
        for (const token of ["", "short", "AB".repeat(32), `${"ab".repeat(32)}x`]) {
            expect(await acceptInvite({}, form({ token }))).toEqual({ error: "This invite link isn't valid." });
        }
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("sends signed-out visitors to log in and come back", async () => {
        state.supabase.rpc.mockResolvedValue({ data: null, error: { message: "not_authenticated" } });
        await expectRedirect(acceptInvite({}, form({ token: TOKEN })), `/auth/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
    });

    it("explains a full team and a used or expired invite", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "seat_limit" } });
        expect((await acceptInvite({}, form({ token: TOKEN }))).error).toMatch(/team is full/);

        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
        expect((await acceptInvite({}, form({ token: TOKEN }))).error).toMatch(/expired or was already used/);
        expect(state.cookies.values.size).toBe(0);
    });
});

describe("joinInvitedBusiness (from onboarding)", () => {
    it("joins and switches to the business", async () => {
        state.supabase.rpc.mockResolvedValue({ data: BUSINESS_ID, error: null });
        await expectRedirect(joinInvitedBusiness({}, form({ invitationId: INVITATION_ID })), "/dashboard");
        expect(state.supabase.rpc).toHaveBeenCalledWith("accept_invitation", { p_invitation_id: INVITATION_ID });
        expect(state.cookies.values.get(ACTIVE_BUSINESS_COOKIE)).toBe(BUSINESS_ID);
    });

    it("explains failures", async () => {
        expect((await joinInvitedBusiness({}, form({ invitationId: "nope" }))).error).toBe("That invite no longer exists.");
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "seat_limit" } });
        expect((await joinInvitedBusiness({}, form({ invitationId: INVITATION_ID }))).error).toMatch(/team is full/);
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "gone" } });
        expect((await joinInvitedBusiness({}, form({ invitationId: INVITATION_ID }))).error).toMatch(/expired or was canceled/);
    });
});
