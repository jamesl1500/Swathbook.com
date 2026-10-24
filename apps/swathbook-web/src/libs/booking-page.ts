/**
 * booking-page.ts
 *
 * Loads a business's public booking page (get_booking_page returns only
 * publishable fields). Wrapped in React cache() so metadata and the page share
 * one query per request.
 *
 * @module src/libs/booking-page
 * @since 1.0.0
 */

import { cache } from "react";
import { createAdminClient, hasAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type PublicService = {
    id: string;
    name: string;
    description: string | null;
    price_type: "fixed" | "starting_at" | "quote";
    price_cents: number;
    duration_minutes: number;
    deposit_cents: number;
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
        logo_path: string | null;
        cover_path: string | null;
        brand_color: string | null;
        timezone: string;
        currency: string;
        service_radius_miles: number | null;
        cancellation_window_hours: number;
        deposit_refund_policy: "refundable" | "refundable_before_window" | "non_refundable";
        accepts_online_payments: boolean;
    };
    services: PublicService[];
    hours: Array<{ weekday: number; opens_at: string; closes_at: string }>;
    photos: Array<{ id: string; storage_path: string; caption: string | null }>;
};

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const loadBookingPage = cache(async (slug: string): Promise<BookingPageData | null> => {
    if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 40) return null;
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_booking_page", { p_slug: slug });
    return (data as BookingPageData | null) ?? null;
});

/** Name of a business that exists but has paused bookings (for a friendlier notice than a 404). */
export const loadPausedBusinessName = cache(async (slug: string) => {
    if (!SLUG_PATTERN.test(slug) || !hasAdminClient()) return null;
    const { data } = await createAdminClient().from("businesses").select("name").eq("slug", slug).eq("is_published", false).maybeSingle();
    return data?.name ?? null;
});
