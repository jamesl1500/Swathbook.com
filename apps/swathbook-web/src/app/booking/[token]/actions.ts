"use server";

import { refresh } from "next/cache";
import { isBookingToken } from "@/libs/customer-booking";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { createBookingPayment, type PaymentKind, type PaymentSession } from "@/libs/stripe/payments";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";
import { isDateKey } from "@/libs/time";

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

export type RescheduleSlot = { start: string; end: string };

/** Open times for moving this booking, one day at a time. */
export async function getRescheduleSlots(token: string, date: string): Promise<{ slots: RescheduleSlot[] } | { error: string }> {
    if (!isBookingToken(token) || !isDateKey(date)) return { error: "Pick a day." };
    const { data, error } = await createAdminClient().rpc("get_reschedule_slots", { p_token: token, p_from: date, p_days: 1 });
    if (error) return { error: "We couldn't load open times. Please try again." };
    return { slots: (data ?? []).map((slot) => ({ start: slot.slot_start, end: slot.slot_end })) };
}

const RESCHEDULE_ERRORS: Record<string, string> = {
    slot_unavailable: "Someone just took that time. Pick another one.",
    too_late: "It's too close to your appointment to change it online. Please contact the business.",
    limit: "This booking has been moved the maximum number of times online. Please contact the business.",
    not_offered: "This business doesn't take online reschedules. Please contact them.",
    cancel_requested: "You've asked to cancel this booking, so it can't be moved.",
};

export async function rescheduleMyBooking(token: string, start: string): Promise<{ ok: true } | { error: string }> {
    if (!isBookingToken(token) || Number.isNaN(Date.parse(start))) return { error: "Pick a time." };
    const admin = createAdminClient();
    const { error } = await admin.rpc("customer_reschedule_booking", { p_token: token, p_start: start });
    if (error) {
        const code = error.message === "reschedule_not_allowed" ? (error.details ?? "") : error.message;
        return { error: RESCHEDULE_ERRORS[code] ?? "We couldn't move your booking. Please try again." };
    }
    sendQueuedEmailsSoon();
    refresh();
    return { ok: true };
}

export async function cancelMyBooking(token: string, reason: string): Promise<{ outcome: "cancelled" | "requested" } | { error: string }> {
    if (!isBookingToken(token)) return { error: "That booking link isn't valid." };
    const { data, error } = await createAdminClient().rpc("customer_cancel_booking", { p_token: token, p_reason: reason.slice(0, 500) });
    if (error || (data !== "cancelled" && data !== "requested")) {
        return { error: "This booking can't be cancelled online. Please contact the business." };
    }
    sendQueuedEmailsSoon();
    refresh();
    return { outcome: data };
}
