/**
 * public-booking.ts
 *
 * Places a booking for a customer: the shared core of the public booking page
 * (submitBooking) and the customer app (POST /api/app/bookings). Looks the
 * business up, geocodes the address for the service-area check and routing,
 * checks any area measurement against the address, and calls create_booking
 * with the service role. Payments and emails are left to the caller.
 *
 * @module src/libs/public-booking
 * @since 1.0.0
 */

import { z } from "zod";
import { geocodeAddress, hasGoogleMaps, placeDetails } from "@/libs/google/maps";
import { checkArea, checkMeasurement, distanceMeters, MAX_POLYGON_POINTS, MAX_POLYGONS, type LatLng } from "@/libs/measure/geo";
import { type BookingAnswerInput } from "@/libs/service-questions";
import { createAdminClient } from "@/libs/supabase/admin";

export const bookingCustomerSchema = z.object({
    fullName: z.string().trim().min(2, { error: "Enter your name." }).max(120),
    email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email." })),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ().-]{7,20}$/, { error: "Enter a valid phone number." })]),
});

export const bookingAddressSchema = z.object({
    line1: z.string().trim().min(3, { error: "Enter the service address." }).max(200),
    line2: z.string().trim().max(200).default(""),
    city: z.string().trim().max(100).default(""),
    region: z.string().trim().max(100).default(""),
    postalCode: z.string().trim().max(20).default(""),
    placeId: z.string().max(300).default(""),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
});

/** For services priced by area: the outline drawn on the map, or a size the customer typed. */
export const measurementSchema = z.union([
    z.object({ polygons: z.array(z.array(z.tuple([z.number(), z.number()])).max(MAX_POLYGON_POINTS)).min(1).max(MAX_POLYGONS) }),
    z.object({ areaSqft: z.number().int() }),
]);

export type MeasurementInput = z.output<typeof measurementSchema>;

export type PlaceBookingInput = {
    slug: string;
    serviceIds: string[];
    start: string;
    customer: z.output<typeof bookingCustomerSchema>;
    address: z.output<typeof bookingAddressSchema>;
    notes: string;
    /** Answers to the chosen services' questions (create_booking checks them). */
    answers?: BookingAnswerInput[];
    measurement?: MeasurementInput | null;
};

export type PlacedBooking = {
    bookingId: string;
    reference: string;
    token: string;
    status: string;
    totalCents: number;
    depositDueCents: number;
    holdExpiresAt: string | null;
    stripeAccountId: string | null;
};

export type PlaceBookingResult = { ok: true; booking: PlacedBooking } | { ok: false; code: BookingErrorCode | "failed"; error: string };

/** create_booking's errors, as customers should read them. */
export const BOOKING_ERRORS = {
    slot_unavailable: "Someone just booked that time. Please pick another.",
    outside_service_area: "That address is outside this business's service area.",
    invalid_email: "Enter a valid email address.",
    invalid_services: "One of those services is no longer available. Refresh and try again.",
    business_not_found: "This business isn't taking bookings right now.",
    answers_required: "Answer the questions about your booking.",
    invalid_answers: "One of your answers isn't valid. Check them and try again.",
    invalid_measurement: "We couldn't read that measurement. Outline the area again, or enter its size.",
} as const;

export type BookingErrorCode = keyof typeof BOOKING_ERRORS;

const FAILED = "We couldn't complete your booking. Please try again.";

export type ResolvedLocation = { location: LatLng | null; placeId: string | null; formatted: string | null };

/**
 * Coordinates for a booking address: the ones the browser already has (from
 * a picked suggestion), else Google's, else none. They power the
 * service-area check, the neighbor discount, measuring and route planning.
 */
export async function resolveLocation(address: z.output<typeof bookingAddressSchema>): Promise<ResolvedLocation> {
    let location = address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null;
    let formatted: string | null = null;
    let placeId = address.placeId || null;
    if (hasGoogleMaps()) {
        if (!location && placeId) {
            const resolved = await placeDetails(placeId);
            if (resolved?.lat != null && resolved.lng != null) location = { lat: resolved.lat, lng: resolved.lng };
            formatted = resolved?.formatted ?? null;
        }
        if (!location) {
            const text = [address.line1, address.city, address.region, address.postalCode].filter(Boolean).join(", ");
            const geocoded = await geocodeAddress(text);
            if (geocoded) {
                location = { lat: geocoded.lat, lng: geocoded.lng };
                placeId ??= geocoded.placeId;
                formatted = geocoded.formatted;
            }
        }
    }
    return { location, placeId, formatted };
}

const METERS_PER_MILE = 1609.344;

/** True when `location` is beyond the business's service radius (false when either is unknown). */
export function outsideServiceArea(
    business: { base_lat: number | null; base_lng: number | null; service_radius_miles: number | null },
    location: LatLng | null,
) {
    if (!location || business.base_lat == null || business.base_lng == null || business.service_radius_miles == null) return false;
    return distanceMeters({ lat: business.base_lat, lng: business.base_lng }, location) / METERS_PER_MILE > business.service_radius_miles;
}

type BookingMeasurement = { area_sqft: number; polygons: Array<Array<[number, number]>> | null };

/** The measurement as create_booking takes it, checked against the address. */
export function measurementForBooking(
    measurement: MeasurementInput | null | undefined,
    location: LatLng | null,
): { ok: true; value: BookingMeasurement | null } | { ok: false; error: string } {
    if (!measurement) return { ok: true, value: null };
    if ("areaSqft" in measurement) {
        const checked = checkArea(measurement.areaSqft);
        return checked.ok ? { ok: true, value: { area_sqft: checked.areaSqft, polygons: null } } : checked;
    }
    if (!location) return { ok: false, error: "We couldn't find your address on the map. Enter the size instead." };
    const checked = checkMeasurement(measurement.polygons, location);
    return checked.ok ? { ok: true, value: { area_sqft: checked.areaSqft, polygons: checked.polygons } } : checked;
}

export async function placeBooking({
    slug,
    serviceIds,
    start,
    customer,
    address,
    notes,
    answers = [],
    measurement = null,
}: PlaceBookingInput): Promise<PlaceBookingResult> {
    const admin = createAdminClient();
    const { data: business } = await admin.from("businesses").select("id").eq("slug", slug).eq("is_published", true).maybeSingle();
    if (!business) return { ok: false, code: "business_not_found", error: BOOKING_ERRORS.business_not_found };

    const { location, placeId, formatted } = await resolveLocation(address);
    const measured = measurementForBooking(measurement, location);
    if (!measured.ok) return { ok: false, code: "invalid_measurement", error: measured.error };

    const { data, error } = await admin.rpc("create_booking", {
        p_business_id: business.id,
        p_service_ids: serviceIds,
        p_start: start,
        p_customer: { full_name: customer.fullName, email: customer.email, phone: customer.phone },
        p_address: {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            region: address.region,
            postal_code: address.postalCode,
            country: "US",
            lat: location?.lat ?? null,
            lng: location?.lng ?? null,
        },
        p_customer_notes: notes || undefined,
        p_source: "booking_page",
        p_answers: answers.map(({ questionId, answer }) => ({ question_id: questionId, answer })),
        ...(measured.value ? { p_measurement: measured.value } : {}),
    });
    if (error) {
        const code = (Object.keys(BOOKING_ERRORS) as BookingErrorCode[]).find((key) => error.message.includes(key));
        if (!code) console.error("[booking] create_booking failed", error);
        return code ? { ok: false, code, error: BOOKING_ERRORS[code] } : { ok: false, code: "failed", error: FAILED };
    }

    const row = data?.[0];
    if (!row) return { ok: false, code: "failed", error: FAILED };

    if (placeId || formatted) {
        const { data: saved } = await admin.from("bookings").select("address_id").eq("id", row.booking_id).single();
        if (saved?.address_id) {
            await admin.from("customer_addresses").update({ google_place_id: placeId, formatted_address: formatted }).eq("id", saved.address_id);
        }
    }

    return {
        ok: true,
        booking: {
            bookingId: row.booking_id,
            reference: row.reference,
            token: row.public_token,
            status: row.status,
            totalCents: row.total_cents,
            depositDueCents: row.deposit_due_cents,
            holdExpiresAt: row.hold_expires_at,
            stripeAccountId: row.stripe_account_id,
        },
    };
}
