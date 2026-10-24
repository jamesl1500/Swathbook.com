"use server";

import { isBookingToken } from "@/libs/customer-booking";
import { createBookingPayment, type PaymentKind, type PaymentSession } from "@/libs/stripe/payments";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";

export async function startPayment(token: string, kind: PaymentKind): Promise<PaymentSession | { error: string }> {
    if (!isBookingToken(token) || (kind !== "deposit" && kind !== "balance")) return { error: "That payment link isn't valid." };
    if (!hasStripe()) return { error: "Online payments aren't available right now." };

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("id").eq("public_token", token).maybeSingle();
    if (!booking) return { error: "We couldn't find that booking." };

    try {
        return await createBookingPayment(getStripe(), admin, { bookingId: booking.id, kind });
    } catch (error) {
        console.error("[booking] startPayment failed", error);
        return { error: "We couldn't start the payment. Please try again." };
    }
}
