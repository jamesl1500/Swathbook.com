// @vitest-environment node
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleStripeEvent = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "processed");
vi.mock("@/libs/stripe/webhooks", () => ({ handleStripeEvent }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { POST } = await import("./route");
const { resetStripeClient } = await import("@/libs/stripe/server");

const body = JSON.stringify({
    id: "evt_test_1",
    object: "v2.core.event",
    type: "v1.payment_intent.succeeded",
    created: "2026-10-23T12:00:00.000Z",
    livemode: false,
    context: "acct_connected",
    related_object: { id: "pi_1", type: "payment_intent", url: "/v1/payment_intents/pi_1" },
});

function signed(secret: string) {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    return new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } });
}

beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_platform, whsec_connected");
    resetStripeClient();
    handleStripeEvent.mockClear();
});

afterEach(() => {
    vi.unstubAllEnvs();
    resetStripeClient();
});

describe("POST /api/stripe/webhook", () => {
    it.each(["whsec_platform", "whsec_connected"])("accepts events signed by either destination (%s)", async (secret) => {
        const response = await POST(signed(secret));
        expect(response.status).toBe(200);
        const event = handleStripeEvent.mock.calls[0]?.at(2) as { id: string; context: unknown };
        expect(event.id).toBe("evt_test_1");
        // The SDK wraps context in a StripeContext; the handler reads it via String().
        expect(String(event.context)).toBe("acct_connected");
    });

    it("rejects a signature from an unknown secret", async () => {
        const response = await POST(signed("whsec_attacker"));
        expect(response.status).toBe(400);
        expect(handleStripeEvent).not.toHaveBeenCalled();
    });

    it("rejects a request with no signature", async () => {
        const response = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body }));
        expect(response.status).toBe(400);
    });

    it("asks Stripe to retry when processing fails", async () => {
        handleStripeEvent.mockRejectedValueOnce(new Error("db down"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const response = await POST(signed("whsec_connected"));
        expect(response.status).toBe(500);
    });

    it("is unavailable when no secret is configured", async () => {
        vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
        const response = await POST(signed("whsec_platform"));
        expect(response.status).toBe(503);
    });
});
