import { z } from "zod";
import { appError, appJson, appPreflight, authenticateApp, readJson } from "@/libs/app-api";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";

/**
 * POST /api/app/bookings/:id/reschedule  { start }
 *
 * Moves one of the signed-in customer's bookings. reschedule_my_booking checks
 * it's theirs, then applies the same rules as the emailed manage-booking link.
 */

const RESCHEDULE_ERRORS: Record<string, string> = {
    slot_unavailable: "Someone just took that time. Pick another one.",
    too_late: "It's too close to your appointment to change it online. Please contact the business.",
    limit: "This booking has been moved the maximum number of times online. Please contact the business.",
    not_offered: "This business doesn't take online reschedules. Please contact them.",
    cancel_requested: "You've asked to cancel this booking, so it can't be moved.",
    status: "This booking can't be moved anymore.",
    booking_not_found: "We couldn't find that booking.",
};

const schema = z.object({ start: z.iso.datetime({ offset: true }) });

export function OPTIONS() {
    return appPreflight();
}

export async function POST(request: Request, { params }: RouteContext<"/api/app/bookings/[bookingId]/reschedule">) {
    const { bookingId } = await params;
    if (!z.uuid().safeParse(bookingId).success) return appError(404, "booking_not_found", RESCHEDULE_ERRORS.booking_not_found);

    const auth = await authenticateApp(request);
    if ("response" in auth) return auth.response;

    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return appError(422, "invalid", "Pick a time.");

    const { error } = await auth.supabase.rpc("reschedule_my_booking", { p_booking_id: bookingId, p_start: parsed.data.start });
    if (error) {
        const code = error.message === "reschedule_not_allowed" ? (error.details ?? "status") : error.message;
        const message = RESCHEDULE_ERRORS[code];
        if (!message) console.error("[app] reschedule failed", error);
        return appError(code === "booking_not_found" ? 404 : message ? 409 : 500, message ? code : "failed",
            message ?? "We couldn't move your booking. Please try again.");
    }

    sendQueuedEmailsSoon(bookingId);
    const { data: booking } = await auth.supabase.rpc("my_booking", { p_booking_id: bookingId });
    return appJson({ booking });
}
