"use server";

import { z } from "zod";
import { canMeasure, satelliteLinks } from "@/libs/google/satellite";
import type { LatLng, MapZoom } from "@/libs/measure/geo";
import {
    BOOKING_ERRORS,
    bookingAddressSchema,
    bookingCustomerSchema,
    measurementSchema,
    outsideServiceArea,
    placeBooking,
    resolveLocation,
} from "@/libs/public-booking";
import { bookingAnswersSchema } from "@/libs/service-questions";
import { isDateKey } from "@/libs/time";
import { createBookingPayment, type PaymentSession } from "@/libs/stripe/payments";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { createClient } from "@/libs/supabase/server";

export type Slot = { start: string; end: string; neighborDiscountPercent: number };

const slugField = z.string().min(3).max(40);
const coordinate = z.number().finite();

const availabilitySchema = z.object({
    slug: slugField,
    serviceIds: z.array(z.uuid()).min(1).max(10),
    from: z.string().refine(isDateKey),
    days: z.number().int().min(1).max(14).default(7),
    location: z.object({ lat: coordinate.min(-90).max(90), lng: coordinate.min(-180).max(180) }).nullable().default(null),
    areaSqft: z.number().int().min(100).max(1_000_000).nullable().default(null),
});

export async function getAvailability(input: z.input<typeof availabilitySchema>): Promise<{ slots: Slot[] } | { error: string }> {
    const parsed = availabilitySchema.safeParse(input);
    if (!parsed.success) return { error: "Pick a service and a date." };
    const { slug, serviceIds, from, days, location, areaSqft } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_available_slots", {
        p_slug: slug,
        p_service_ids: serviceIds,
        p_from: from,
        p_days: days,
        ...(location ? { p_lat: location.lat, p_lng: location.lng } : {}),
        ...(areaSqft ? { p_area_sqft: areaSqft } : {}),
    });
    if (error) return { error: "We couldn't load open times. Please try again." };
    return {
        slots: (data ?? []).map((slot) => ({ start: slot.slot_start, end: slot.slot_end, neighborDiscountPercent: slot.neighbor_discount_percent ?? 0 })),
    };
}

const locateSchema = z.object({
    slug: slugField,
    address: bookingAddressSchema,
    /** A chosen service is priced by area, so the customer will want the map. */
    wantsMap: z.boolean().default(false),
});

export type LocateResult =
    | { ok: true; location: LatLng | null; satellite: Record<MapZoom, string> | null }
    | { ok: false; error: string; fieldErrors?: Partial<Record<string, string[]>> };

/**
 * The booking page's "Where" step: finds the address on the map, says early
 * if it's outside the service area, and hands back satellite photo links when
 * the customer has an area to measure.
 */
export async function locateAddress(input: z.input<typeof locateSchema>): Promise<LocateResult> {
    const parsed = locateSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = [issue.message];
        return { ok: false, error: "Check the highlighted fields.", fieldErrors };
    }
    const { slug, address, wantsMap } = parsed.data;

    const { data: business } = await createAdminClient()
        .from("businesses")
        .select("base_lat, base_lng, service_radius_miles")
        .eq("slug", slug.toLowerCase())
        .eq("is_published", true)
        .maybeSingle();
    if (!business) return { ok: false, error: BOOKING_ERRORS.business_not_found };

    const { location } = await resolveLocation(address);
    if (outsideServiceArea(business, location)) return { ok: false, error: BOOKING_ERRORS.outside_service_area };

    return { ok: true, location, satellite: wantsMap && location && canMeasure() ? satelliteLinks(location) : null };
}

const bookingSchema = z.object({
    slug: slugField,
    serviceIds: z.array(z.uuid()).min(1).max(10),
    start: z.iso.datetime({ offset: true }),
    customer: bookingCustomerSchema,
    address: bookingAddressSchema,
    notes: z.string().trim().max(2000).default(""),
    answers: bookingAnswersSchema,
    measurement: measurementSchema.nullable().default(null),
    /** Honeypot: real people never see or fill this field. */
    company: z.string().max(0).default(""),
});

export type BookingRequest = z.input<typeof bookingSchema>;

export type BookingResult =
    | { ok: true; token: string; payment: PaymentSession | null }
    | { ok: false; error: string; code?: string; fieldErrors?: Partial<Record<string, string[]>> };

export async function submitBooking(input: BookingRequest): Promise<BookingResult> {
    const parsed = bookingSchema.safeParse(input);
    if (!parsed.success) {
        const flat = z.flattenError(parsed.error);
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
            fieldErrors[issue.path.join(".")] = [issue.message];
        }
        return { ok: false, error: flat.formErrors[0] ?? "Check the highlighted fields.", fieldErrors };
    }
    const { slug, serviceIds, start, customer, address, notes, answers, measurement } = parsed.data;

    const placed = await placeBooking({ slug, serviceIds, start, customer, address, notes, answers, measurement });
    if (!placed.ok) return { ok: false, error: placed.error, code: placed.code };
    const booking = placed.booking;

    let payment: PaymentSession | null = null;
    if (booking.depositDueCents > 0 && booking.stripeAccountId && hasStripe()) {
        const session = await createBookingPayment(getStripe(), createAdminClient(), { bookingId: booking.bookingId, kind: "deposit" });
        if ("clientSecret" in session) payment = session;
    }

    // Confirmations (or the owner's request notice) go out right after this response.
    sendQueuedEmailsSoon(booking.bookingId);
    return { ok: true, token: booking.token, payment };
}
