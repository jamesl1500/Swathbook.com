/**
 * booking-page.ts
 *
 * Loads a business's public booking page (get_booking_page returns only
 * publishable fields). It's the busiest page on the site, so it's cached
 * across requests ('use cache') and dropped whenever the business changes
 * something it shows: every write path calls bookingPageChanged() (see
 * libs/booking-page-cache.ts). A few minutes' time-based refresh covers what
 * changes on its own, like a trial running out.
 *
 * @module src/libs/booking-page
 * @since 1.0.0
 */

import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { bookingPageTag, bookingSlugTag } from "./booking-page-cache";
import type { ServiceQuestion } from "./service-questions";
import { createAdminClient, hasAdminClient } from "./supabase/admin";
import { createPublicClient } from "./supabase/public";

export type PublicService = {
    id: string;
    name: string;
    description: string | null;
    price_type: "fixed" | "starting_at" | "quote";
    price_cents: number;
    duration_minutes: number;
    /** The deposit at the service's own (minimum) price. */
    deposit_cents: number;
    /** How the deposit is worked out, for prices that change with a measured area. "none" without online payments. */
    deposit_type: "none" | "percent" | "fixed";
    deposit_percent: number;
    deposit_amount_cents: number;
    /** Set when the price follows the area the customer measures; price_cents is then the minimum. */
    price_per_1000_sqft_cents: number | null;
    minutes_per_1000_sqft: number | null;
    /** What the customer answers when booking this service ("Make and model?"). */
    questions: ServiceQuestion[];
};

export type BookingPageData = {
    business: {
        id: string;
        name: string;
        slug: string;
        trade: string;
        description: string | null;
        phone: string | null;
        email: string | null;
        website_url: string | null;
        service_area: string | null;
        logo_path: string | null;
        cover_path: string | null;
        brand_color: string | null;
        timezone: string;
        currency: string;
        service_radius_miles: number | null;
        cancellation_window_hours: number;
        deposit_refund_policy: "refundable" | "refundable_before_window" | "non_refundable";
        accepts_online_payments: boolean;
        /** Percent off on days the business already works nearby; 0 when not offered. */
        neighbor_discount_percent: number;
    };
    services: PublicService[];
    hours: Array<{ weekday: number; opens_at: string; closes_at: string }>;
    photos: Array<{ id: string; storage_path: string; caption: string | null }>;
};

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Shared across visitors: it reads as an anonymous visitor would, with no cookies. */
async function cachedBookingPage(slug: string): Promise<BookingPageData | null> {
    "use cache";
    // By slug too, so a business publishing (or taking) a slug that had no
    // page shows up at once.
    cacheTag(bookingSlugTag(slug));
    const { data, error } = await createPublicClient().rpc("get_booking_page", { p_slug: slug });
    // Throwing keeps a failed lookup out of the cache.
    if (error) throw new Error(`get_booking_page failed: ${error.message}`);
    const page = (data as BookingPageData | null) ?? null;
    if (page) {
        cacheTag(bookingPageTag(page.business.id));
        // Edits drop the entry straight away; this only bounds what changes
        // by itself (a trial ending pauses the page).
        cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
    } else {
        // No page (unknown, or paused): kept briefly, since a plan starting
        // again brings it back without anyone editing it.
        cacheLife({ stale: 30, revalidate: 30, expire: 60 });
    }
    return page;
}

/** One lookup per request, from the shared cache when it has the page. */
export const loadBookingPage = cache(async (slug: string): Promise<BookingPageData | null> => {
    if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 40) return null;
    try {
        return await cachedBookingPage(slug);
    } catch (error) {
        unstable_rethrow(error);
        console.error("[booking-page] couldn't load", slug, error);
        return null;
    }
});

/**
 * Name of a set-up business whose page is closed (bookings paused by the owner,
 * or no active trial or plan), for a friendlier notice than a 404. Only called
 * after get_booking_page found nothing.
 */
export const loadPausedBusinessName = cache(async (slug: string) => {
    if (!SLUG_PATTERN.test(slug) || !hasAdminClient()) return null;
    const { data } = await createAdminClient()
        .from("businesses")
        .select("name")
        .eq("slug", slug)
        .not("onboarding_completed_at", "is", null)
        .maybeSingle();
    return data?.name ?? null;
});
