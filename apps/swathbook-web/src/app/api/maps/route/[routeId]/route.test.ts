// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock, staticMapUrl: vi.fn() }));
vi.mock("@/libs/google/maps", () => ({ staticMapUrl: state.staticMapUrl }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));

import { GET } from "./route";

const ROUTE_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";
const call = (routeId = ROUTE_ID) => GET(new Request(`https://swathbook.test/api/maps/route/${routeId}`), { params: Promise.resolve({ routeId }) } as never);

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.staticMapUrl.mockReset().mockReturnValue("https://maps.googleapis.test/staticmap?key=secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PNG", { status: 200, headers: { "Content-Type": "image/png" } })));
});

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/maps/route/[routeId]", () => {
    it("draws the stops in sequence and proxies the image so the key stays server-side", async () => {
        state.supabase.respond("routes.select", {
            data: {
                start_lat: 30,
                start_lng: -97,
                optimization_meta: { polyline: "abc" },
                route_stops: [
                    { sequence: 2, bookings: { customer_addresses: { lat: 30.2, lng: -97.2 } } },
                    { sequence: 1, bookings: { customer_addresses: { lat: 30.1, lng: -97.1 } } },
                    { sequence: 3, bookings: { customer_addresses: { lat: null, lng: null } } },
                    { sequence: 4, bookings: null },
                ],
            },
        });
        const response = await call();

        expect(state.staticMapUrl).toHaveBeenCalledWith({
            start: { lat: 30, lng: -97 },
            stops: [
                { lat: 30.1, lng: -97.1 },
                { lat: 30.2, lng: -97.2 },
            ],
            polyline: "abc",
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
        expect(await response.text()).toBe("PNG");
        expect(response.headers.get("Location")).toBeNull();
    });

    it("404s for malformed ids without querying, and for routes RLS hides", async () => {
        expect((await call("../../etc/passwd")).status).toBe(404);
        expect(state.supabase.calls).toHaveLength(0);
        expect((await call()).status).toBe(404);
    });

    it("404s when maps aren't configured and 502s when Google fails", async () => {
        state.supabase.respond("routes.select", { data: { start_lat: null, start_lng: null, optimization_meta: null, route_stops: [] } });
        state.staticMapUrl.mockReturnValueOnce(null);
        expect((await call()).status).toBe(404);

        vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 403 })));
        expect((await call()).status).toBe(502);
    });
});
