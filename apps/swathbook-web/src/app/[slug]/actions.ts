"use server";

import { z } from "zod";
import { geocodeAddress, hasGoogleMaps, placeDetails } from "@/libs/google/maps";
import { isDateKey } from "@/libs/time";
import { createBookingPayment, type PaymentSession } from "@/libs/stripe/payments";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";
import { createClient } from "@/libs/supabase/server";

export type Slot = { start: string; end: string };

const availabilitySchema = z.object({
    slug: z.string().min(3).max(40),
    serviceIds: z.array(z.uuid()).min(1).max(10),
    from: z.string().refine(isDateKey),
    days: z.number().int().min(1).max(14).default(7),
});

export async function getAvailability(input: z.input<typeof availabilitySchema>): Promise<{ slots: Slot[] } | { error: string }> {
    const parsed = availabilitySchema.safeParse(input);
    if (!parsed.success) return { error: "Pick a service and a date." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_available_slots", {
        p_slug: parsed.data.slug,
        p_service_ids: parsed.data.serviceIds,
        p_from: parsed.data.from,
        p_days: parsed.data.days,
    });
    if (error) return { error: "We couldn't load open times. Please try again." };
    return { slots: (data ?? []).map((slot) => ({ start: slot.slot_start, end: slot.slot_end })) };
}

const bookingSchema = z.object({
    slug: z.string().min(3).max(40),
    serviceIds: z.array(z.uuid()).min(1).max(10),
    start: z.iso.datetime({ offset: true }),
    customer: z.object({
        fullName: z.string().trim().min(2, { error: "Enter your name." }).max(120),
        email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email." })),
        phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ().-]{7,20}$/, { error: "Enter a valid phone number." })]),
    }),
    address: z.object({
        line1: z.string().trim().min(3, { error: "Enter the service address." }).max(200),
        line2: z.string().trim().max(200).default(""),
        city: z.string().trim().max(100).default(""),
        region: z.string().trim().max(100).default(""),
        postalCode: z.string().trim().max(20).default(""),
        placeId: z.string().max(300).default(""),
        lat: z.number().min(-90).max(90).nullable().default(null),
        lng: z.number().min(-180).max(180).nullable().default(null),
    }),
    notes: z.string().trim().max(2000).default(""),
    /** Honeypot: real people never see or fill this field. */
    company: z.string().max(0).default(""),
});

export type BookingRequest = z.input<typeof bookingSchema>;

export type BookingResult =
    | { ok: true; token: string; payment: PaymentSession | null }
    | { ok: false; error: string; fieldErrors?: Partial<Record<string, string[]>> };

const DATABASE_ERRORS: Record<string, string> = {
    slot_unavailable: "Someone just booked that time. Please pick another.",
    outside_service_area: "That address is outside this business's service area.",
    invalid_email: "Enter a valid email address.",
    invalid_services: "One of those services is no longer available. Refresh and try again.",
    business_not_found: "This business isn't taking bookings right now.",
};

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
    const { slug, serviceIds, start, customer, address, notes } = parsed.data;

    const admin = createAdminClient();
    const { data: business } = await admin.from("businesses").select("id").eq("slug", slug).eq("is_published", true).maybeSingle();
    if (!business) return { ok: false, error: DATABASE_ERRORS.business_not_found };

    // Coordinates power the service-area check and route planning.
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
    });
    if (error) {
        const code = Object.keys(DATABASE_ERRORS).find((key) => error.message.includes(key));
        if (!code) console.error("[booking] create_booking failed", error);
        return { ok: false, error: code ? DATABASE_ERRORS[code] : "We couldn't complete your booking. Please try again." };
    }

    const booking = data?.[0];
    if (!booking) return { ok: false, error: "We couldn't complete your booking. Please try again." };

    if (placeId || formatted) {
        const { data: row } = await admin.from("bookings").select("address_id").eq("id", booking.booking_id).single();
        if (row?.address_id) {
            await admin.from("customer_addresses").update({ google_place_id: placeId, formatted_address: formatted }).eq("id", row.address_id);
        }
    }

    let payment: PaymentSession | null = null;
    if (booking.deposit_due_cents > 0 && booking.stripe_account_id && hasStripe()) {
        const session = await createBookingPayment(getStripe(), admin, { bookingId: booking.booking_id, kind: "deposit" });
        if ("clientSecret" in session) payment = session;
    }

    return { ok: true, token: booking.public_token, payment };
}
