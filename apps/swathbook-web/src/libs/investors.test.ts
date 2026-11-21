// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./email/send", () => ({ sendEmail: state.send }));

import { investorInbox, investorInterestSchema, sendInvestorDigest } from "./investors";

afterEach(() => vi.unstubAllEnvs());

describe("investorInterestSchema", () => {
    it("tidies what people type and fills in the optional parts", () => {
        expect(
            investorInterestSchema.parse({
                fullName: "  Ada Park ",
                email: " Ada@Example.COM ",
                firm: "",
                investorType: "angel",
                checkSize: "made-up",
                accredited: true,
                message: "  ",
            }),
        ).toEqual({ fullName: "Ada Park", email: "ada@example.com", firm: null, investorType: "angel", checkSize: "not_sure", accredited: true, message: null });
    });

    it("needs a name, a real email and an investor type", () => {
        const result = investorInterestSchema.safeParse({ fullName: "A", email: "nope", firm: "", investorType: undefined, checkSize: "", accredited: false, message: "" });
        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["email", "fullName", "investorType"]);
    });
});

describe("sendInvestorDigest", () => {
    let admin: SupabaseMock;
    const row = {
        id: "i1",
        full_name: "Ada Park",
        email: "ada@example.com",
        firm: "Park Ventures",
        investor_type: "fund",
        check_size: "25k_100k",
        accredited: true,
        message: "We back vertical SaaS for the trades.",
        created_at: "2026-11-21T12:00:00Z",
    };

    beforeEach(() => {
        admin = createSupabaseMock();
        state.send.mockReset().mockResolvedValue({ ok: true, provider: "mailpit", id: "m1" });
    });

    it("emails new interest to the team and marks it", async () => {
        admin.respond("investor_interest.select", { data: [row] });
        expect(await sendInvestorDigest(admin.client as never, { baseUrl: "https://swathbook.test" })).toEqual({ sent: 1 });

        const email = state.send.mock.calls[0][0];
        expect(email).toMatchObject({ to: investorInbox(), subject: "Investor interest: Ada Park, Park Ventures", replyTo: "ada@example.com" });
        expect(email.text).toContain("Ada Park, Park Ventures, ada@example.com (Venture fund · $25k to $100k · accredited): We back vertical SaaS");
        expect(email.text).toContain("https://swathbook.test/admin/investors");
        expect(admin.callsTo("investor_interest", "update")[0]).toMatchObject({ filters: [["in", "id", ["i1"]]] });
    });

    it("tries again next time when the email doesn't go", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        admin.respond("investor_interest.select", { data: [row] });
        state.send.mockResolvedValue({ ok: false, provider: "resend", error: "down" });
        expect(await sendInvestorDigest(admin.client as never, { baseUrl: "https://swathbook.test" })).toEqual({ sent: 0 });
        expect(admin.callsTo("investor_interest", "update")).toHaveLength(0);
    });

    it("sends nothing when there's nothing new, and goes to INVESTOR_EMAIL when set", async () => {
        admin.respond("investor_interest.select", { data: [] });
        expect(await sendInvestorDigest(admin.client as never, { baseUrl: "https://swathbook.test" })).toEqual({ sent: 0 });
        expect(state.send).not.toHaveBeenCalled();
        vi.stubEnv("INVESTOR_EMAIL", "invest@swathbook.com");
        expect(investorInbox()).toBe("invest@swathbook.com");
    });
});
