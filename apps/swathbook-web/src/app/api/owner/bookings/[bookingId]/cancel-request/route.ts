import { z } from "zod";
import { appError, appJson, appPreflight, authenticateApp, readJson } from "@/libs/app-api";
import { resolveCancelRequest } from "@/libs/cancel-requests";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";

/**
 * POST /api/owner/bookings/:id/cancel-request  { approve, refund?, note? }
 *
 * The owner app answers a customer's cancellation request. It's an API route
 * (not a direct database call) because approving can refund the deposit,
 * and Stripe's keys live only on the server. Owners and admins only; the
 * database checks the same again in resolve_cancel_request.
 */

const schema = z.object({
    approve: z.boolean(),
    refund: z.boolean().default(false),
    note: z.string().trim().max(500, { error: "Keep the note under 500 characters." }).default(""),
});

export function OPTIONS() {
    return appPreflight();
}

export async function POST(request: Request, { params }: RouteContext<"/api/owner/bookings/[bookingId]/cancel-request">) {
    const { bookingId } = await params;
    if (!z.uuid().safeParse(bookingId).success) return appError(404, "booking_not_found", "We couldn't find that booking.");

    const auth = await authenticateApp(request);
    if ("response" in auth) return auth.response;

    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return appError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the request.");

    // RLS only shows bookings at the caller's own businesses.
    const { data: booking } = await auth.supabase.from("bookings").select("business_id").eq("id", bookingId).maybeSingle();
    if (!booking) return appError(404, "booking_not_found", "We couldn't find that booking.");

    const { data: member } = await auth.supabase
        .from("business_members")
        .select("role")
        .eq("business_id", booking.business_id)
        .eq("user_id", auth.user.id)
        .eq("status", "active")
        .maybeSingle();
    if (!member || member.role === "crew") return appError(403, "not_allowed", "Only owners and admins can answer cancellation requests.");

    const result = await resolveCancelRequest(auth.supabase, { businessId: booking.business_id, userId: auth.user.id }, { bookingId, ...parsed.data });
    if (!result.ok) return appError(409, "not_allowed", result.error);

    sendQueuedEmailsSoon(bookingId);
    return appJson({ message: result.message });
}
