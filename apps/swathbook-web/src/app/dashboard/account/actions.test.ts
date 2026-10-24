// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieJar, expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

type User = { id: string; email: string; fullName: string; desiredSlug: string };

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    admin: null as unknown as SupabaseMock,
    user: null as User | null,
    jar: null as unknown as ReturnType<typeof createCookieJar>,
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => state.jar) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/auth", () => ({ getCurrentUser: vi.fn(async () => state.user) }));
vi.mock("@/libs/site-url", () => ({ getSiteUrl: vi.fn(async () => "https://swathbook.test") }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: vi.fn(() => state.admin.client) }));

import { changeEmail, changePassword, deleteAccount, updateName } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const passwordOk = () => state.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
const passwordWrong = () =>
    state.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "bad" } });

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.admin = createSupabaseMock();
    state.user = { id: "u1", email: "dana@example.com", fullName: "Dana Field", desiredSlug: "" };
    state.jar = createCookieJar({ swathbook_business: "b1" });
    state.supabase.auth.updateUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("updateName", () => {
    it("saves the profile and session metadata, then refreshes the session", async () => {
        const result = await updateName({}, form({ fullName: "  Dana Q. Field " }));
        expect(result).toEqual({ success: "Name saved." });
        expect(state.supabase.callsTo("profiles", "update")[0]).toMatchObject({ values: { full_name: "Dana Q. Field" }, filters: [["eq", "id", "u1"]] });
        expect(state.supabase.auth.updateUser).toHaveBeenCalledWith({ data: { full_name: "Dana Q. Field" } });
        expect(state.supabase.auth.refreshSession).toHaveBeenCalled();
    });

    it("rejects a blank name", async () => {
        const result = await updateName({}, form({ fullName: " " }));
        expect(result.fieldErrors?.fullName).toEqual(["Enter your name."]);
        expect(state.supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it("needs a session", async () => {
        state.user = null;
        expect((await updateName({}, form({ fullName: "Dana" }))).error).toMatch(/Log in again/);
    });
});

describe("changeEmail", () => {
    it("checks the password, then asks Supabase to confirm the new address", async () => {
        passwordOk();
        const result = await changeEmail({}, form({ email: "New@Example.com", currentPassword: "hunter22" }));
        expect(state.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "dana@example.com", password: "hunter22" });
        expect(state.supabase.auth.updateUser).toHaveBeenCalledWith(
            { email: "new@example.com" },
            { emailRedirectTo: "https://swathbook.test/auth/confirm?next=/dashboard/account" },
        );
        expect(result.success).toMatch(/Check new@example.com/);
    });

    it("stops on a wrong password without touching the email", async () => {
        passwordWrong();
        const result = await changeEmail({}, form({ email: "new@example.com", currentPassword: "nope" }));
        expect(result.fieldErrors?.currentPassword).toEqual(["That password isn't right."]);
        expect(state.supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it("rejects the current address and taken addresses", async () => {
        passwordOk();
        const same = await changeEmail({}, form({ email: "DANA@example.com", currentPassword: "x" }));
        expect(same.fieldErrors?.email).toEqual(["That's already your email."]);

        state.supabase.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists", message: "taken" } });
        const taken = await changeEmail({}, form({ email: "taken@example.com", currentPassword: "x" }));
        expect(taken.fieldErrors?.email).toEqual(["Another account already uses that email."]);
    });
});

describe("changePassword", () => {
    const valid = { currentPassword: "old-password", password: "new-password-1", confirmPassword: "new-password-1" };

    it("changes the password after re-checking the current one", async () => {
        passwordOk();
        expect(await changePassword({}, form(valid))).toEqual({ success: "Password changed." });
        expect(state.supabase.auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    });

    it("validates the new password before checking anything", async () => {
        const result = await changePassword({}, form({ ...valid, confirmPassword: "different" }));
        expect(result.fieldErrors?.confirmPassword).toEqual(["Passwords don't match."]);
        expect(state.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("reports a wrong current password and a reused password", async () => {
        passwordWrong();
        expect((await changePassword({}, form(valid))).fieldErrors?.currentPassword).toBeDefined();

        passwordOk();
        state.supabase.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: "same_password", message: "same" } });
        expect((await changePassword({}, form(valid))).fieldErrors?.password).toEqual(["That's your current password. Pick a new one."]);
    });

    it("surfaces rate limits", async () => {
        state.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "over_request_rate_limit", message: "slow down" } });
        expect((await changePassword({}, form(valid))).error).toMatch(/Too many attempts/);
    });
});

describe("deleteAccount", () => {
    const valid = { confirmation: "Delete My Account", currentPassword: "hunter22" };

    it("deletes the account and its files, signs out and says goodbye", async () => {
        passwordOk();
        state.admin.respond("businesses.select", { data: [{ id: "b1" }] });
        state.admin.files.set("business-assets/b1", [{ name: "logo-1.png", id: "f1" }]);
        state.admin.files.set("job-files/b1", [{ name: "booking-9", id: null }]);
        state.admin.files.set("job-files/b1/booking-9", [{ name: "photo.jpg", id: "f2" }]);

        await expectRedirect(deleteAccount({}, form(valid)), "/auth/login?notice=account_deleted");

        expect(state.admin.rpc).toHaveBeenCalledWith("delete_account", { p_user_id: "u1" });
        expect(state.admin.removed).toEqual([
            { bucket: "business-assets", paths: ["b1/logo-1.png"] },
            { bucket: "job-files", paths: ["b1/booking-9/photo.jpg"] },
        ]);
        expect(state.supabase.auth.signOut).toHaveBeenCalled();
        expect(state.jar.values.has("swathbook_business")).toBe(false);
    });

    it("requires the exact confirmation phrase", async () => {
        const result = await deleteAccount({}, form({ ...valid, confirmation: "delete" }));
        expect(result.fieldErrors?.confirmation).toBeDefined();
        expect(state.admin.rpc).not.toHaveBeenCalled();
    });

    it("requires the right password", async () => {
        passwordWrong();
        expect((await deleteAccount({}, form(valid))).fieldErrors?.currentPassword).toBeDefined();
        expect(state.admin.rpc).not.toHaveBeenCalled();
    });

    it("explains when upcoming jobs block deletion", async () => {
        passwordOk();
        state.admin.rpc.mockResolvedValue({ data: null, error: { message: "upcoming_jobs", details: "3" } as never });
        const result = await deleteAccount({}, form(valid));
        expect(result.error).toBe("Your businesses still have 3 upcoming jobs. Cancel or finish them first so no customer is left waiting.");
        expect(state.supabase.auth.signOut).not.toHaveBeenCalled();
        expect(state.admin.removed).toEqual([]);
    });
});
