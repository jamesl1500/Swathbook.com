// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    customer: { id: "u1", email: "cara@example.com" } as { id: string; email: string } | null,
    deleteResult: { deleted: true } as { deleted: true } | { deleted: false; reason: "has_business" | "failed" },
    refresh: vi.fn(),
}));

vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("next/cache", () => ({ refresh: state.refresh }));
vi.mock("@/libs/customer", () => ({ getCustomer: vi.fn(async () => state.customer) }));
vi.mock("@/libs/customer-account", () => ({ deleteCustomerLogin: vi.fn(async () => state.deleteResult) }));

import { deleteCustomerLogin } from "@/libs/customer-account";
import { customerSignIn, deleteCustomerAccount, saveCustomerDetails, signOutCustomer, type CustomerSignInState } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const start: CustomerSignInState = { step: "email", email: "" };

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.customer = { id: "u1", email: "cara@example.com" };
    state.deleteResult = { deleted: true };
});

describe("customerSignIn: sending a code", () => {
    it("checks the email before calling Supabase", async () => {
        const result = await customerSignIn(start, form({ intent: "send", email: "not-an-email" }));
        expect(result).toMatchObject({ step: "email", email: "not-an-email", fieldErrors: { email: ["Enter a valid email address."] } });
        expect(state.supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });

    it("sends a code to the normalized email and creates the account if needed", async () => {
        const result = await customerSignIn(start, form({ intent: "send", email: "  Cara@Example.COM " }));
        expect(result).toEqual({ step: "code", email: "cara@example.com", notice: undefined });
        expect(state.supabase.auth.signInWithOtp).toHaveBeenCalledWith({
            email: "cara@example.com",
            options: { shouldCreateUser: true, data: { customer_app: true } },
        });
    });

    it("explains rate limits instead of failing silently", async () => {
        state.supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { code: "over_email_send_rate_limit", message: "x" } });
        const result = await customerSignIn(start, form({ intent: "send", email: "cara@example.com" }));
        expect(result).toMatchObject({ step: "email", error: "We just sent a code. Wait a minute, then try again." });
    });

    it("keeps the code step on a failed resend", async () => {
        state.supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { message: "x", status: 429 } });
        const result = await customerSignIn({ step: "code", email: "cara@example.com" }, form({ intent: "resend", email: "cara@example.com" }));
        expect(result.step).toBe("code");
        expect(result.error).toMatch(/Wait a minute/);
    });

    it("confirms a resend", async () => {
        const result = await customerSignIn({ step: "code", email: "cara@example.com" }, form({ intent: "resend", email: "cara@example.com" }));
        expect(result).toEqual({ step: "code", email: "cara@example.com", notice: "We sent a new code." });
    });

    it("goes back to the email step on 'Different email'", async () => {
        expect(await customerSignIn({ step: "code", email: "cara@example.com" }, form({ intent: "change" }))).toEqual({ step: "email", email: "cara@example.com" });
    });
});

describe("customerSignIn: checking the code", () => {
    it("rejects a malformed code without calling Supabase", async () => {
        const result = await customerSignIn(start, form({ intent: "verify", email: "cara@example.com", code: "12ab" }));
        expect(result).toMatchObject({ step: "code", fieldErrors: { code: ["Enter the code from the email."] } });
        expect(state.supabase.auth.verifyOtp).not.toHaveBeenCalled();
    });

    it("starts over if the hidden email was tampered with", async () => {
        const result = await customerSignIn(start, form({ intent: "verify", email: "nope", code: "12345678" }));
        expect(result.step).toBe("email");
    });

    it("signs in with a pasted code (spaces ignored) and goes to My jobs", async () => {
        await expectRedirect(customerSignIn(start, form({ intent: "verify", email: "cara@example.com", code: "1234 5678" })), "/my/jobs");
        expect(state.supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "cara@example.com", token: "12345678", type: "email" });
    });

    it("honors a same-site ?next= and ignores an off-site one", async () => {
        await expectRedirect(customerSignIn(start, form({ intent: "verify", email: "cara@example.com", code: "123456", next: "/my/jobs/abc" })), "/my/jobs/abc");
        await expectRedirect(customerSignIn(start, form({ intent: "verify", email: "cara@example.com", code: "123456", next: "//evil.example" })), "/my/jobs");
    });

    it("says a wrong or expired code is wrong, on the code field", async () => {
        state.supabase.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: "otp_expired", message: "Token has expired or is invalid" } });
        const result = await customerSignIn(start, form({ intent: "verify", email: "cara@example.com", code: "12345678" }));
        expect(result).toMatchObject({ step: "code", email: "cara@example.com", fieldErrors: { code: [expect.stringMatching(/wrong or has expired/)] } });
    });

    it("ignores unknown intents", async () => {
        expect(await customerSignIn(start, form({ intent: "hack" }))).toEqual({ step: "email", email: "" });
    });
});

describe("signOutCustomer", () => {
    it("signs out and says so", async () => {
        await expectRedirect(signOutCustomer(), "/my/sign-in?notice=signed_out");
        expect(state.supabase.auth.signOut).toHaveBeenCalled();
    });
});

const details = { fullName: "Cara Customer", phone: "512-555-0100", line1: "12 Elm St", line2: "", city: "Austin", region: "TX", postalCode: "78701" };

describe("saveCustomerDetails", () => {
    it("needs a session", async () => {
        state.customer = null;
        expect(await saveCustomerDetails({}, form(details))).toEqual({ error: "Your session has expired. Sign in again." });
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("validates before saving", async () => {
        const result = await saveCustomerDetails({}, form({ ...details, fullName: "C", phone: "call me", line1: "ab" }));
        expect(result.fieldErrors).toMatchObject({
            fullName: ["Enter your name."],
            phone: ["Enter a valid phone number."],
            line1: ["Enter a street address, or leave it blank."],
        });
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("saves through save_my_details as the signed-in customer", async () => {
        expect(await saveCustomerDetails({}, form(details))).toEqual({ success: "Saved. New bookings will use these details." });
        expect(state.supabase.rpc).toHaveBeenCalledWith("save_my_details", {
            p_full_name: "Cara Customer",
            p_phone: "512-555-0100",
            p_address: { line1: "12 Elm St", line2: "", city: "Austin", region: "TX", postal_code: "78701" },
            p_finish_setup: true,
        });
        expect(state.refresh).toHaveBeenCalled();
    });

    it("sends no phone when it's blank", async () => {
        await saveCustomerDetails({}, form({ ...details, phone: "" }));
        expect(state.supabase.rpc.mock.calls[0][1]).toMatchObject({ p_phone: undefined });
    });

    it("maps the database's validation errors to fields", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid_phone" } });
        expect(await saveCustomerDetails({}, form(details))).toMatchObject({ fieldErrors: { phone: ["Enter a valid phone number."] } });
    });

    it("gives a generic message for anything else", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
        expect(await saveCustomerDetails({}, form(details))).toEqual({ error: "We couldn't save your details. Please try again." });
    });
});

describe("deleteCustomerAccount", () => {
    it("needs the confirmation typed", async () => {
        expect((await deleteCustomerAccount({}, form({ confirm: "yes" }))).fieldErrors).toEqual({ confirm: ["Type DELETE to confirm."] });
        expect(deleteCustomerLogin).not.toHaveBeenCalled();
    });

    it("deletes, signs out and says so", async () => {
        await expectRedirect(deleteCustomerAccount({}, form({ confirm: "delete" })), "/my/sign-in?notice=account_deleted");
        expect(deleteCustomerLogin).toHaveBeenCalledWith("u1");
        expect(state.supabase.auth.signOut).toHaveBeenCalled();
    });

    it("won't delete a login that belongs to a business", async () => {
        state.deleteResult = { deleted: false, reason: "has_business" };
        expect((await deleteCustomerAccount({}, form({ confirm: "DELETE" }))).error).toMatch(/part of a business/);
        expect(state.supabase.auth.signOut).not.toHaveBeenCalled();
    });

    it("needs a session", async () => {
        state.customer = null;
        expect(await deleteCustomerAccount({}, form({ confirm: "DELETE" }))).toEqual({ error: "Your session has expired. Sign in again." });
        expect(deleteCustomerLogin).not.toHaveBeenCalled();
    });
});
