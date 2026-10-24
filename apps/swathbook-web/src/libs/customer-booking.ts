/**
 * customer-booking.ts
 *
 * Loads a booking by its public token for the customer-facing pages. The
 * 64-hex-char token is the only credential, so lookups use the service role
 * and return just what the customer should see.
 *
 * @module src/libs/customer-booking
 * @since 1.0.0
 */

import { cache } from "react";
import { createAdminClient } from "./supabase/admin";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isBookingToken(value: unknown): value is string {
    return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export const loadCustomerBooking = cache(async (token: string) => {
    if (!isBookingToken(token)) return null;
    const { data } = await createAdminClient()
        .from("bookings")
        .select(
            `id, reference, status, scheduled_start, scheduled_end, hold_expires_at, currency, total_cents, deposit_due_cents,
             deposit_paid_cents, amount_paid_cents, amount_refunded_cents, balance_due_cents, customer_notes, public_token,
             businesses(name, slug, phone, email, timezone, brand_color, logo_path, cancellation_window_hours),
             booking_items(name, quantity, line_total_cents, sort_order),
             customer_addresses(line1, line2, city, region, postal_code),
             customers(full_name, email),
             payments(kind, status, amount_cents, amount_refunded_cents, succeeded_at, card_brand, card_last4)`,
        )
        .eq("public_token", token)
        .maybeSingle();
    return data;
});

export type CustomerBooking = NonNullable<Awaited<ReturnType<typeof loadCustomerBooking>>>;
