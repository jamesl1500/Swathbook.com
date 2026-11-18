/**
 * booking-page-cache.ts
 *
 * Tags for the cached public booking page (see libs/booking-page.ts), and
 * the call every write path makes when it changes something the page shows:
 * the business's details, services and their questions, hours, photos,
 * publishing, its Stripe account or its plan.
 *
 * Expires at once (not stale-while-revalidate): a price shown on the page
 * has to match what create_booking charges.
 *
 * @module src/libs/booking-page-cache
 * @since 1.0.0
 */

import { revalidateTag } from "next/cache";

/** Every cached page of one business, whatever its slug was. */
export function bookingPageTag(businessId: string) {
    return `booking-page:${businessId}`;
}

/** The cached answer for one slug, including "no page here". */
export function bookingSlugTag(slug: string) {
    return `booking-page:slug:${slug.toLowerCase()}`;
}

/**
 * Drops the business's cached booking page. Pass `slugs` when a page appears
 * at a slug (publishing, a new slug) so a cached "not found" goes too. Works
 * in Server Actions and Route Handlers (webhooks), not while rendering.
 */
export function bookingPageChanged(businessId: string, { slugs = [] }: { slugs?: Array<string | null | undefined> } = {}) {
    const tags = [bookingPageTag(businessId), ...slugs.filter((slug): slug is string => Boolean(slug)).map(bookingSlugTag)];
    for (const tag of tags) {
        try {
            revalidateTag(tag, { expire: 0 });
        } catch (error) {
            // A webhook or save must never fail over the cache; the page
            // refreshes within minutes anyway.
            console.error(`[booking-page] couldn't expire ${tag}`, error instanceof Error ? error.message : error);
        }
    }
}
