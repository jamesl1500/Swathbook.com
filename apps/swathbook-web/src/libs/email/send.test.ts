// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resend = vi.hoisted(() => ({ send: vi.fn(), constructed: [] as unknown[] }));
vi.mock("resend", () => ({
    Resend: class {
        emails = { send: resend.send };
        constructor(key: unknown) {
            resend.constructed.push(key);
        }
    },
}));

import { emailFrom, emailProvider, resetEmailClient, sendEmail } from "./send";

const email = { to: "ada@example.com", subject: "Your booking", html: "<p>Hi</p>", text: "Hi", replyTo: "owner@example.com" };

beforeEach(() => {
    resetEmailClient();
    resend.constructed.length = 0;
    resend.send.mockReset().mockResolvedValue({ data: { id: "re_123" }, error: null });
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAILPIT_URL", "");
    vi.stubEnv("EMAIL_FROM", "");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("emailProvider", () => {
    it("prefers Resend, then Mailpit, else nothing", () => {
        expect(emailProvider()).toBeNull();
        vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:55424");
        expect(emailProvider()).toBe("mailpit");
        vi.stubEnv("RESEND_API_KEY", "re_key");
        expect(emailProvider()).toBe("resend");
    });

    it("uses EMAIL_FROM when set", () => {
        expect(emailFrom()).toMatch(/<bookings@/);
        vi.stubEnv("EMAIL_FROM", "Shine <hi@shine.test>");
        expect(emailFrom()).toBe("Shine <hi@shine.test>");
    });
});

describe("sendEmail", () => {
    it("skips (and says why) when nothing is configured", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(await sendEmail(email)).toEqual({ ok: false, provider: "none", error: expect.stringMatching(/RESEND_API_KEY/) });
    });

    it("sends through Resend with an idempotency key, reusing one client", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_key");
        vi.stubEnv("EMAIL_FROM", "Shine <hi@shine.test>");
        expect(await sendEmail({ ...email, idempotencyKey: "booking:1:confirmed" })).toEqual({ ok: true, provider: "resend", id: "re_123" });
        await sendEmail(email);

        expect(resend.constructed).toEqual(["re_key"]);
        expect(resend.send).toHaveBeenNthCalledWith(
            1,
            { from: "Shine <hi@shine.test>", to: "ada@example.com", subject: "Your booking", html: "<p>Hi</p>", text: "Hi", replyTo: "owner@example.com" },
            { idempotencyKey: "booking:1:confirmed" },
        );
        expect(resend.send.mock.calls[1][1]).toBeUndefined();
    });

    it("reports Resend errors", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_key");
        resend.send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Invalid `to` field" } });
        expect(await sendEmail(email)).toEqual({ ok: false, provider: "resend", error: "validation_error: Invalid `to` field" });
    });

    it("delivers to the Mailpit inbox locally", async () => {
        vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:55424/");
        vi.stubEnv("EMAIL_FROM", "Swathbook <bookings@swathbook.com>");
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ID: "mp_1" }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        expect(await sendEmail(email)).toEqual({ ok: true, provider: "mailpit", id: "mp_1" });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:55424/api/v1/send");
        expect(JSON.parse(init.body as string)).toEqual({
            From: { Name: "Swathbook", Email: "bookings@swathbook.com" },
            To: [{ Email: "ada@example.com" }],
            ReplyTo: [{ Email: "owner@example.com" }],
            Subject: "Your booking",
            HTML: "<p>Hi</p>",
            Text: "Hi",
        });
    });

    it("reports Mailpit failures", async () => {
        vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:55424");
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
        expect(await sendEmail(email)).toEqual({ ok: false, provider: "mailpit", error: "Mailpit 500" });
    });
});
