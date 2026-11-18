// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./email/send", () => ({ sendEmail: state.send }));

import { describeBrowser, feedbackInbox, feedbackSchema, isStaffEmail, sendFeedbackDigest } from "./feedback";

afterEach(() => vi.unstubAllEnvs());

describe("describeBrowser", () => {
    it("names the browser and system without keeping the whole user agent", () => {
        expect(describeBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")).toBe("Chrome on macOS");
        expect(describeBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
        expect(describeBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0")).toBe("Edge on Windows");
        expect(describeBrowser(null)).toBeNull();
    });
});

describe("isStaffEmail", () => {
    it("lets in only the listed addresses, whatever the case", () => {
        vi.stubEnv("SWATHBOOK_STAFF_EMAILS", " Sam@Swathbook.com, ops@swathbook.com ");
        expect(isStaffEmail("sam@swathbook.com")).toBe(true);
        expect(isStaffEmail("OPS@swathbook.com")).toBe(true);
        expect(isStaffEmail("sam@swathbook.co")).toBe(false);
        expect(isStaffEmail("")).toBe(false);
    });

    it("lets nobody in when the list is unset", () => {
        vi.stubEnv("SWATHBOOK_STAFF_EMAILS", "");
        expect(isStaffEmail("sam@swathbook.com")).toBe(false);
    });
});

describe("feedbackSchema", () => {
    it("trims the note, and drops a rating or page it can't use", () => {
        expect(feedbackSchema.parse({ kind: "idea", message: "  Dark mode  ", rating: "4", contactOk: true, page: "/dashboard/schedule" })).toEqual({
            kind: "idea",
            message: "Dark mode",
            rating: 4,
            contactOk: true,
            page: "/dashboard/schedule",
        });
        expect(feedbackSchema.parse({ kind: "idea", message: "Dark mode", rating: "9", contactOk: false, page: "https://evil.example" })).toMatchObject({
            rating: null,
            page: null,
        });
        expect(feedbackSchema.safeParse({ kind: "idea", message: "hi", rating: null, contactOk: true, page: null }).success).toBe(false);
        expect(feedbackSchema.safeParse({ kind: "rant", message: "Dark mode", rating: null, contactOk: true, page: null }).success).toBe(false);
    });
});

describe("sendFeedbackDigest", () => {
    let admin: SupabaseMock;
    const note = {
        id: "f1",
        source: "owner_app",
        kind: "problem",
        rating: 2,
        message: "The map froze on the job screen",
        page: "job/abc",
        email: "olive@example.com",
        contact_ok: true,
        app_version: "1.2.0",
        platform: "ios 18.1",
        created_at: "2026-11-18T12:00:00Z",
        businesses: { name: "Green Acres" },
    };

    beforeEach(() => {
        admin = createSupabaseMock();
        state.send.mockReset().mockResolvedValue({ ok: true, provider: "mailpit", id: "m1" });
    });

    it("emails new notes to the team in one message and marks them", async () => {
        admin.respond("feedback.select", { data: [note] });
        expect(await sendFeedbackDigest(admin.client as never, { baseUrl: "https://swathbook.test" })).toEqual({ sent: 1 });

        const email = state.send.mock.calls[0][0];
        expect(email).toMatchObject({ to: feedbackInbox(), subject: "Feedback: The map froze on the job screen", replyTo: "olive@example.com" });
        expect(email.text).toContain("Problem · 2/5 from olive@example.com, Green Acres (Owner app · job/abc · v1.2.0 · ios 18.1)");
        expect(email.text).toContain("https://swathbook.test/admin/feedback");
        expect(admin.callsTo("feedback", "update")[0]).toMatchObject({ filters: [["in", "id", ["f1"]]] });
    });

    it("tries again next time when the email doesn't go", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        admin.respond("feedback.select", { data: [note] });
        state.send.mockResolvedValue({ ok: false, provider: "resend", error: "down" });
        expect(await sendFeedbackDigest(admin.client as never, { baseUrl: "https://swathbook.test" })).toEqual({ sent: 0 });
        expect(admin.callsTo("feedback", "update")).toHaveLength(0);
    });

    it("sends nothing when there's nothing new, and goes to FEEDBACK_EMAIL when set", async () => {
        admin.respond("feedback.select", { data: [] });
        expect(await sendFeedbackDigest(admin.client as never, { baseUrl: "https://swathbook.test" })).toEqual({ sent: 0 });
        expect(state.send).not.toHaveBeenCalled();
        vi.stubEnv("FEEDBACK_EMAIL", "team@swathbook.com");
        expect(feedbackInbox()).toBe("team@swathbook.com");
    });
});
