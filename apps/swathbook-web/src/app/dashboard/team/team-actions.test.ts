// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID, form } from "@/test/dashboard";

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
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.role === "crew" ? { error: "Only owners and admins can do that." } : { user: { id: "u-owner", email: "olive@example.com", fullName: "Olive Owner" }, role: state.role, businessId: BUSINESS_ID }));

import { changeRole, inviteMember, removeMember, resendInvite, revokeInvite } from "./actions";

const INVITE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

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

describe("resendInvite and revokeInvite", () => {
    it("sends a fresh link for an open invite", async () => {
        state.supabase.respond("business_invitations.select", { data: { email: "carl@example.com", role: "crew" } });
        state.supabase.rpc.mockResolvedValue({ data: "c".repeat(64), error: null });
        const result = await resendInvite(form({ inviteId: INVITE_ID }));

        expect(state.supabase.callsTo("business_invitations", "select")[0].filters).toContainEqual(["eq", "business_id", BUSINESS_ID]);
        expect(state.supabase.rpc).toHaveBeenCalledWith("create_business_invitation", { p_business_id: BUSINESS_ID, p_email: "carl@example.com", p_role: "crew" });
        expect(result.inviteUrl).toBe(`https://swathbook.test/invite/${"c".repeat(64)}`);
    });

    it("won't resend missing, malformed or owner invites", async () => {
        expect((await resendInvite(form({ inviteId: "nope" }))).error).toBe("That invite no longer exists.");
        expect((await resendInvite(form({ inviteId: INVITE_ID }))).error).toBe("That invite no longer exists.");
        state.supabase.respond("business_invitations.select", { data: { email: "x@example.com", role: "owner" } });
        expect((await resendInvite(form({ inviteId: INVITE_ID }))).error).toBe("That invite no longer exists.");
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("revokes only unaccepted invites in this business", async () => {
        expect(await revokeInvite(form({ inviteId: INVITE_ID }))).toEqual({ success: "Invite canceled." });
        const update = state.supabase.callsTo("business_invitations", "update")[0];
        expect(update.values).toEqual({ revoked_at: expect.any(String) });
        expect(update.filters).toEqual([
            ["eq", "id", INVITE_ID],
            ["eq", "business_id", BUSINESS_ID],
            ["is", "accepted_at", null],
        ]);
    });

    it("crew can't resend or revoke", async () => {
        state.role = "crew";
        expect((await resendInvite(form({ inviteId: INVITE_ID }))).error).toBeDefined();
        expect((await revokeInvite(form({ inviteId: INVITE_ID }))).error).toBeDefined();
        expect(state.supabase.calls).toHaveLength(0);
    });
});
