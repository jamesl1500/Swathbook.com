// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";
const MEMBER_ID = "0b6b0a56-2d0f-4c3e-9f0a-6a1d2c3b4e5f";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    role: "owner" as "owner" | "admin" | "crew",
    sendEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/site-url", () => ({ getSiteUrl: vi.fn(async () => "https://swathbook.test") }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/email/send", () => ({ sendEmail: state.sendEmail }));
vi.mock("@/libs/dashboard", () => ({
    authorizeBusiness: vi.fn(async () =>
        state.role === "crew" ? { error: "Only owners and admins can do that." } : { user: { id: "u-owner", email: "olive@example.com", fullName: "Olive Owner" }, role: state.role, businessId: BUSINESS_ID },
    ),
    isFailure: (value: unknown) => typeof value === "object" && value !== null && "error" in value,
}));

import { changeRole, inviteMember, removeMember } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set("businessId", BUSINESS_ID);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.role = "owner";
    state.sendEmail.mockReset().mockResolvedValue({ ok: true, provider: "resend", id: "re_1" });
    state.supabase.respond("businesses.select", { data: { name: "Shine On" } });
});

describe("inviteMember", () => {
    it("creates the invite and emails a link to it", async () => {
        state.supabase.rpc.mockImplementation(async (fn: string) =>
            fn === "team_members" ? { data: [{ email: "olive@example.com" }], error: null } : { data: "a".repeat(64), error: null },
        );
        const result = await inviteMember({}, form({ email: "Carl@Example.com", role: "crew" }));

        expect(state.supabase.rpc).toHaveBeenCalledWith("create_business_invitation", { p_business_id: BUSINESS_ID, p_email: "carl@example.com", p_role: "crew" });
        expect(result).toEqual({ success: "Invite sent to carl@example.com.", inviteUrl: `https://swathbook.test/invite/${"a".repeat(64)}` });
        expect(state.sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: "carl@example.com", subject: "Olive Owner invited you to Shine On on Swathbook", replyTo: "olive@example.com" }),
        );
    });

    it("still hands over the link when the email fails", async () => {
        state.supabase.rpc.mockImplementation(async (fn: string) => (fn === "team_members" ? { data: [], error: null } : { data: "b".repeat(64), error: null }));
        state.sendEmail.mockResolvedValue({ ok: false, provider: "none", error: "not configured" });
        const result = await inviteMember({}, form({ email: "carl@example.com", role: "crew" }));
        expect(result.success).toMatch(/didn't send/);
        expect(result.inviteUrl).toContain("/invite/");
    });

    it("explains a full plan", async () => {
        state.supabase.rpc.mockImplementation(async (fn: string) =>
            fn === "team_members" ? { data: [], error: null } : { data: null, error: { message: "seat_limit" } },
        );
        expect((await inviteMember({}, form({ email: "carl@example.com", role: "crew" }))).error).toMatch(/seats are full/);
    });

    it("won't invite someone already on the team", async () => {
        state.supabase.rpc.mockResolvedValue({ data: [{ email: "carl@example.com" }], error: null });
        expect((await inviteMember({}, form({ email: "carl@example.com", role: "crew" }))).fieldErrors?.email).toEqual(["They're already on your team."]);
    });

    it("crew can't invite", async () => {
        state.role = "crew";
        expect((await inviteMember({}, form({ email: "carl@example.com", role: "crew" }))).error).toBeDefined();
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });
});

describe("changeRole and removeMember", () => {
    it("only the owner changes roles, and never the owner's", async () => {
        state.supabase.respond("business_members.update", { data: [{ id: MEMBER_ID }] });
        expect(await changeRole(form({ memberId: MEMBER_ID, role: "admin" }))).toEqual({ success: "They're an admin now." });
        expect(state.supabase.callsTo("business_members", "update")[0].filters).toContainEqual(["neq", "role", "owner"]);

        state.role = "admin";
        expect((await changeRole(form({ memberId: MEMBER_ID, role: "admin" }))).error).toBe("Only the owner can change roles.");
    });

    it("guards the owner, yourself, and admins (owner only)", async () => {
        state.supabase.respond("business_members.select", { data: { user_id: "u-other", role: "owner" } });
        expect((await removeMember(form({ memberId: MEMBER_ID }))).error).toBe("The owner can't be removed.");

        state.supabase = createSupabaseMock();
        state.supabase.respond("business_members.select", { data: { user_id: "u-owner", role: "admin" } });
        expect((await removeMember(form({ memberId: MEMBER_ID }))).error).toBe("You can't remove yourself.");

        state.supabase = createSupabaseMock();
        state.role = "admin";
        state.supabase.respond("business_members.select", { data: { user_id: "u-other", role: "admin" } });
        expect((await removeMember(form({ memberId: MEMBER_ID }))).error).toBe("Only the owner can remove admins.");
    });

    it("removes crew", async () => {
        state.supabase.respond("business_members.select", { data: { user_id: "u-crew", role: "crew" } });
        expect(await removeMember(form({ memberId: MEMBER_ID }))).toEqual({ success: "Removed from the team. Their jobs are now unassigned." });
        expect(state.supabase.callsTo("business_members", "delete")).toHaveLength(1);
    });
});
