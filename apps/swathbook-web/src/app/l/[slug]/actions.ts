"use server";

import { z } from "zod";
import { bookingAddressSchema, bookingCustomerSchema, placeBooking } from "@/libs/public-booking";
import { isDateKey } from "@/libs/time";
import { createBookingPayment, type PaymentSession } from "@/libs/stripe/payments";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";
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
    customer: bookingCustomerSchema,
    address: bookingAddressSchema,
    notes: z.string().trim().max(2000).default(""),
    /** Honeypot: real people never see or fill this field. */
    company: z.string().max(0).default(""),
});

export type BookingRequest = z.input<typeof bookingSchema>;

export type BookingResult =
    | { ok: true; token: string; payment: PaymentSession | null }
    | { ok: false; error: string; fieldErrors?: Partial<Record<string, string[]>> };

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

    const placed = await placeBooking({ slug, serviceIds, start, customer, address, notes });
    if (!placed.ok) return { ok: false, error: placed.error };
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
