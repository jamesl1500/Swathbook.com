// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ admin: null as unknown as SupabaseMock, configured: true, allowed: true }));

vi.mock("@/libs/supabase/admin", () => ({ hasAdminClient: () => state.configured, createAdminClient: () => state.admin.client }));
vi.mock("@/libs/rate-limit", () => ({ allowRequest: vi.fn(async () => state.allowed), RATE_LIMITED_MESSAGE: "Too many tries." }));

import { registerInvestorInterest } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const valid = { fullName: "Ada Park", email: "ada@example.com", firm: "Park Ventures", investorType: "angel", checkSize: "25k_100k", accredited: "on", message: "Keen to talk." };

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.configured = true;
    state.allowed = true;
});

describe("registerInvestorInterest", () => {
    it("saves the interest with the service role", async () => {
        const result = await registerInvestorInterest({}, form(valid));
        expect(result.success).toMatch(/we'll be in touch|will be in touch/);
        expect(state.admin.callsTo("investor_interest", "insert")[0].values).toEqual({
            full_name: "Ada Park",
            email: "ada@example.com",
            firm: "Park Ventures",
            investor_type: "angel",
            check_size: "25k_100k",
            accredited: true,
            message: "Keen to talk.",
        });
    });

    it("points out what's missing", async () => {
        const result = await registerInvestorInterest({}, form({ ...valid, email: "not-an-email", investorType: "" }));
        expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["email", "investorType"]);
        expect(state.admin.callsTo("investor_interest", "insert")).toHaveLength(0);
    });

    it("quietly drops bots that fill the hidden field", async () => {
        const result = await registerInvestorInterest({}, form({ ...valid, website: "https://spam.example" }));
        expect(result.success).toBeTruthy();
        expect(state.admin.callsTo("investor_interest", "insert")).toHaveLength(0);
    });

    it("is rate limited", async () => {
        state.allowed = false;
        expect((await registerInvestorInterest({}, form(valid))).error).toBe("Too many tries.");
        expect(state.admin.callsTo("investor_interest", "insert")).toHaveLength(0);
    });

    it("offers email when it can't save", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        state.admin.respond("investor_interest.insert", { error: { message: "down" } });
        expect((await registerInvestorInterest({}, form(valid))).error).toMatch(/email us at/);
    });
});
