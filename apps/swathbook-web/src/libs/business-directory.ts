/**
 * business-directory.ts
 *
 * Data for the public business directory: search (search_businesses) and the
 * trades that have bookable businesses (business_trades). Both are anonymous
 * reads, so results are cached and shared by every visitor; nothing here
 * depends on who is asking.
 *
 * @module src/libs/business-directory
 * @since 1.0.0
 */

import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Database } from "./supabase/database.types";
import { hasSupabaseEnv } from "./supabase/env";
import { createPublicClient } from "./supabase/public";

export type DirectoryBusiness = Database["public"]["Functions"]["search_businesses"]["Returns"][number];

/** Results per page. search_businesses returns at most 50. */
export const DIRECTORY_PAGE_SIZE = 24;
/** Past this, a search should be narrowed rather than paged. */
export const MAX_DIRECTORY_PAGE = 40;
const MAX_QUERY_LENGTH = 100;
const TRADE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export type DirectoryQuery = { q: string; trade: string | null; page: number };

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Turns ?q=&trade=&page= into a clean query. Anything malformed is dropped
 * rather than rejected, so a mangled link still shows a useful page.
 */
export function parseDirectoryQuery(params: Record<string, string | string[] | undefined>): DirectoryQuery {
    const q = (first(params.q) ?? "")
        // Control characters never belong in a search box.
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_QUERY_LENGTH);
    const tradeParam = first(params.trade)?.trim().toLowerCase() ?? "";
    const pageParam = Number.parseInt(first(params.page) ?? "1", 10);
    return {
        q,
        trade: TRADE_PATTERN.test(tradeParam) ? tradeParam : null,
        page: Number.isFinite(pageParam) ? Math.min(Math.max(pageParam, 1), MAX_DIRECTORY_PAGE) : 1,
    };
}

/** The URL for a directory search, without empty or default parameters. */
export function directoryHref(base: string, { q = "", trade = null, page = 1 }: Partial<DirectoryQuery>) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (trade) params.set("trade", trade);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `${base}?${query}` : base;
}

export type DirectoryResults = { businesses: DirectoryBusiness[]; total: number; failed: boolean };

async function cachedSearch(q: string, trade: string | null, page: number) {
    "use cache";
    // Searches change as businesses publish; a few minutes of staleness is fine.
    cacheLife("minutes");
    cacheTag("business-directory");
    const { data, error } = await createPublicClient().rpc("search_businesses", {
        p_query: q || undefined,
        p_trade: trade ?? undefined,
        p_limit: DIRECTORY_PAGE_SIZE,
        p_offset: (page - 1) * DIRECTORY_PAGE_SIZE,
    });
    // Throwing keeps a failed lookup out of the cache.
    if (error) throw new Error(`search_businesses failed: ${error.message}`);
    return { businesses: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
}

/** One page of bookable businesses matching the query. Never throws. */
export async function searchDirectory({ q, trade, page }: DirectoryQuery): Promise<DirectoryResults> {
    if (!hasSupabaseEnv()) return { businesses: [], total: 0, failed: true };
    try {
        return { ...(await cachedSearch(q.toLowerCase(), trade, page)), failed: false };
    } catch (error) {
        unstable_rethrow(error);
        console.error("[directory] search failed", error);
        return { businesses: [], total: 0, failed: true };
    }
}

async function cachedTrades() {
    "use cache";
    cacheLife("hours");
    cacheTag("business-directory");
    const { data, error } = await createPublicClient().rpc("business_trades");
    if (error) throw new Error(`business_trades failed: ${error.message}`);
    return (data ?? []).map((row) => ({ trade: row.trade, count: Number(row.business_count) }));
}

/** Trades with at least one bookable business, busiest first. Empty on failure. */
export async function listDirectoryTrades(): Promise<Array<{ trade: string; count: number }>> {
    if (!hasSupabaseEnv()) return [];
    try {
        return await cachedTrades();
    } catch (error) {
        unstable_rethrow(error);
        console.error("[directory] trades failed", error);
        return [];
    }
}

/** "from $45": the lowest listed price, when there is one. */
export function fromPrice(business: Pick<DirectoryBusiness, "from_price_cents">) {
    const cents = business.from_price_cents;
    if (cents == null || cents <= 0) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
