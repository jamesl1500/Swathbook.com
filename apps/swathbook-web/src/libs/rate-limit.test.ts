import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    headers: new Headers(),
    rpc: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("@/libs/supabase/admin", () => ({
    hasAdminClient: () => true,
    createAdminClient: () => ({ rpc: state.rpc }),
}));

import { allowRequest, bucketFor, clientIp, RATE_LIMITS } from "./rate-limit";

beforeEach(() => {
    state.headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    state.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

afterEach(() => vi.restoreAllMocks());

describe("clientIp", () => {
    it("prefers the platform's x-real-ip, then the first forwarded address", () => {
        expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "203.0.113.7" }))).toBe("198.51.100.2");
        expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
        expect(clientIp(new Headers())).toBeNull();
    });
});

describe("bucketFor", () => {
    it("never holds the raw address, and separates scopes", () => {
        const bucket = bucketFor("booking", "203.0.113.7", "shine-on");
        expect(bucket).toMatch(/^booking:shine-on:[\w-]{22}$/);
        expect(bucket).not.toContain("203.0.113.7");
        expect(bucketFor("booking", "203.0.113.7", "other")).not.toBe(bucket);
        expect(bucketFor("booking", "203.0.113.8", "shine-on")).not.toBe(bucket);
    });
});

describe("allowRequest", () => {
    it("counts the hit against the action's limit", async () => {
        expect(await allowRequest("booking", { scope: "shine-on" })).toBe(true);
        expect(state.rpc).toHaveBeenCalledWith("hit_rate_limit", {
            p_bucket: bucketFor("booking", "203.0.113.7", "shine-on"),
            p_limit: RATE_LIMITS.booking.limit,
            p_window_seconds: RATE_LIMITS.booking.windowSeconds,
        });
    });

    it("says no once the limit is used up", async () => {
        state.rpc.mockResolvedValue({ data: false, error: null });
        expect(await allowRequest("locate")).toBe(false);
    });

    it("counts a signed-in user instead of their address", async () => {
        await allowRequest("booking", { scope: "shine-on", identity: "user-1" });
        expect(state.rpc.mock.calls[0][1].p_bucket).toBe(bucketFor("booking", "user:user-1", "shine-on"));
    });

    it("lets the request through when it can't tell who's asking or can't count", async () => {
        state.headers = new Headers();
        expect(await allowRequest("booking")).toBe(true);
        expect(state.rpc).not.toHaveBeenCalled();

        state.headers = new Headers({ "x-real-ip": "198.51.100.2" });
        vi.spyOn(console, "error").mockImplementation(() => {});
        state.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
        expect(await allowRequest("booking")).toBe(true);
    });
});
