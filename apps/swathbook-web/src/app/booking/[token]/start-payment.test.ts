// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const TOKEN = "a".repeat(64);
const state = vi.hoisted(() => ({ admin: null as unknown as SupabaseMock, stripeConfigured: true, createBookingPayment: vi.fn() }));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/libs/email/worker", () => ({ sendQueuedEmailsSoon: vi.fn() }));
vi.mock("@/libs/stripe/server", () => ({ hasStripe: () => state.stripeConfigured, getStripe: () => ({}) }));
vi.mock("@/libs/stripe/payments", () => ({ createBookingPayment: state.createBookingPayment }));

import { startPayment } from "./actions";

beforeEach(() => {
    state.admin = createSupabaseMock();
    state.stripeConfigured = true;
    state.createBookingPayment.mockReset().mockResolvedValue({ clientSecret: "cs_1", stripeAccountId: "acct_1", amountCents: 2_000 });
});

describe("startPayment", () => {
    it("starts a deposit or balance payment for the booking behind the token", async () => {
        state.admin.respond("bookings.select", { data: { id: "bk1" } });
        expect(await startPayment(TOKEN, "balance")).toEqual({ clientSecret: "cs_1", stripeAccountId: "acct_1", amountCents: 2_000 });
        expect(state.admin.callsTo("bookings", "select")[0].filters).toEqual([["eq", "public_token", TOKEN]]);
        expect(state.createBookingPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), { bookingId: "bk1", kind: "balance" });
    });

    it("rejects bad tokens and payment kinds before looking anything up", async () => {
        expect(await startPayment("nope", "deposit")).toEqual({ error: "That payment link isn't valid." });
        expect(await startPayment(TOKEN, "tip" as never)).toEqual({ error: "That payment link isn't valid." });
        expect(state.admin.calls).toHaveLength(0);
    });

    it("explains when payments are off, the booking is gone, or Stripe fails", async () => {
        state.stripeConfigured = false;
        expect((await startPayment(TOKEN, "deposit")) as { error: string }).toEqual({ error: "Online payments aren't available right now." });

        state.stripeConfigured = true;
        expect((await startPayment(TOKEN, "deposit")) as { error: string }).toEqual({ error: "We couldn't find that booking." });

        vi.spyOn(console, "error").mockImplementation(() => {});
        state.admin.respond("bookings.select", { data: { id: "bk1" } });
        state.createBookingPayment.mockRejectedValue(new Error("stripe down"));
        expect((await startPayment(TOKEN, "deposit")) as { error: string }).toEqual({ error: "We couldn't start the payment. Please try again." });
    });
});
