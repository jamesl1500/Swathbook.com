import { z } from "zod";
import { appError, appJson, appPreflight, authenticateApp, readJson } from "@/libs/app-api";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";

/**
 * POST /api/app/bookings/:id/cancel  { reason? }
 *
 * Cancels one of the signed-in customer's bookings: right away if the
 * business hasn't accepted it yet (`cancelled`), otherwise as a request the
 * business answers (`requested`). Same rules as the manage-booking link.
 */

const schema = z.object({ reason: z.string().trim().max(500).default("") });

export function OPTIONS() {
    return appPreflight();
}

export async function POST(request: Request, { params }: RouteContext<"/api/app/bookings/[bookingId]/cancel">) {
    const { bookingId } = await params;
    if (!z.uuid().safeParse(bookingId).success) return appError(404, "booking_not_found", "We couldn't find that booking.");

    const auth = await authenticateApp(request);
    if ("response" in auth) return auth.response;

    const parsed = schema.safeParse((await readJson(request)) ?? {});
    if (!parsed.success) return appError(422, "invalid", "Keep the reason under 500 characters.");

    const { data: outcome, error } = await auth.supabase.rpc("cancel_my_booking", {
        p_booking_id: bookingId,
        p_reason: parsed.data.reason || undefined,
    });
    if (error?.message === "booking_not_found") return appError(404, "booking_not_found", "We couldn't find that booking.");
    if (error || (outcome !== "cancelled" && outcome !== "requested")) {
        return appError(409, "cancel_not_allowed", "This booking can't be cancelled online. Please contact the business.");
    }

    sendQueuedEmailsSoon(bookingId);
    const { data: booking } = await auth.supabase.rpc("my_booking", { p_booking_id: bookingId });
    return appJson({ outcome, booking });
}
