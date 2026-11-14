// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock, hasEnv: true }));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("./supabase/env", () => ({ hasSupabaseEnv: () => state.hasEnv }));
vi.mock("./supabase/public", () => ({ createPublicClient: () => state.supabase.client }));

import { DIRECTORY_PAGE_SIZE, directoryHref, fromPrice, listDirectoryTrades, parseDirectoryQuery, searchDirectory } from "./business-directory";

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.hasEnv = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("parseDirectoryQuery", () => {
    it("reads a clean query", () => {
        expect(parseDirectoryQuery({ q: " mowing  austin ", trade: "lawn-care", page: "3" })).toEqual({ q: "mowing austin", trade: "lawn-care", page: 3 });
    });

    it("defaults everything", () => {
        expect(parseDirectoryQuery({})).toEqual({ q: "", trade: null, page: 1 });
    });

    it("takes the first of repeated params", () => {
        expect(parseDirectoryQuery({ q: ["a", "b"], page: ["2", "9"] })).toMatchObject({ q: "a", page: 2 });
    });

    it("drops malformed values instead of failing", () => {
        expect(parseDirectoryQuery({ trade: "../etc", page: "-4" })).toEqual({ q: "", trade: null, page: 1 });
        expect(parseDirectoryQuery({ page: "nope" }).page).toBe(1);
        expect(parseDirectoryQuery({ page: "99999" }).page).toBe(40);
    });

    it("strips control characters and caps the length", () => {
        expect(parseDirectoryQuery({ q: "lawn\u0000\ncare" }).q).toBe("lawn care");
        expect(parseDirectoryQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
    });
});

describe("directoryHref", () => {
    it("leaves out empty and default params", () => {
        expect(directoryHref("/businesses", {})).toBe("/businesses");
        expect(directoryHref("/businesses", { q: "", page: 1 })).toBe("/businesses");
        expect(directoryHref("/businesses", { q: "pool & spa", trade: "pool-service", page: 2 })).toBe("/businesses?q=pool+%26+spa&trade=pool-service&page=2");
    });
});

describe("fromPrice", () => {
    it("formats whole and fractional dollars, and hides missing prices", () => {
        expect(fromPrice({ from_price_cents: 4500 })).toBe("$45");
        expect(fromPrice({ from_price_cents: 4550 })).toBe("$45.50");
        expect(fromPrice({ from_price_cents: 0 })).toBeNull();
        expect(fromPrice({ from_price_cents: null as unknown as number })).toBeNull();
    });
});

describe("searchDirectory", () => {
    it("pages through search_businesses and reads the total", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: [{ id: "b1", total_count: 30 }], error: null });
        const results = await searchDirectory({ q: "Mowing", trade: "lawn-care", page: 2 });
        expect(results).toEqual({ businesses: [{ id: "b1", total_count: 30 }], total: 30, failed: false });
        expect(state.supabase.rpc).toHaveBeenCalledWith("search_businesses", {
            p_query: "mowing",
            p_trade: "lawn-care",
            p_limit: DIRECTORY_PAGE_SIZE,
            p_offset: DIRECTORY_PAGE_SIZE,
        });
    });

    it("sends no filters for a blank search", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
        expect(await searchDirectory({ q: "", trade: null, page: 1 })).toEqual({ businesses: [], total: 0, failed: false });
        expect(state.supabase.rpc).toHaveBeenCalledWith("search_businesses", { p_query: undefined, p_trade: undefined, p_limit: DIRECTORY_PAGE_SIZE, p_offset: 0 });
    });

    it("reports a failure instead of throwing", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
        expect(await searchDirectory({ q: "", trade: null, page: 1 })).toEqual({ businesses: [], total: 0, failed: true });
    });

    it("doesn't call Supabase before it's configured", async () => {
        state.hasEnv = false;
        expect((await searchDirectory({ q: "", trade: null, page: 1 })).failed).toBe(true);
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });
});

describe("listDirectoryTrades", () => {
    it("returns trades with counts", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: [{ trade: "lawn-care", business_count: 3 }], error: null });
        expect(await listDirectoryTrades()).toEqual([{ trade: "lawn-care", count: 3 }]);
    });

    it("is empty on failure", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
        expect(await listDirectoryTrades()).toEqual([]);
    });
});
