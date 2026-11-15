import { z } from "zod";
import { appError, appJson, appPreflight, authenticateApp, readJson } from "@/libs/app-api";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { bookingAddressSchema, bookingCustomerSchema, placeBooking } from "@/libs/public-booking";
import { bookingAnswersListSchema } from "@/libs/service-questions";
import { customerBookingPath } from "@/libs/routes";
import { createAdminClient } from "@/libs/supabase/admin";

/**
 * POST /api/app/bookings: the customer app books a job.
 *
 * Same path as the public booking page (placeBooking → create_booking), but
 * the customer's email is always their verified login email, so the booking
 * shows up in their app. Deposits are paid on the booking's web page
 * (`manageUrl`), where Stripe's payment form already lives.
 */

const schema = z.object({
    slug: z.string().min(3).max(40),
    serviceIds: z.array(z.uuid()).min(1).max(10),
    start: z.iso.datetime({ offset: true }),
    customer: bookingCustomerSchema.pick({ fullName: true, phone: true }),
    address: bookingAddressSchema,
    notes: z.string().trim().max(2000).default(""),
    /** Missing from app builds made before services had questions. */
    answers: bookingAnswersListSchema.optional(),
});

export type AppBookingRequest = z.input<typeof schema>;

export function OPTIONS() {
    return appPreflight();
}

export async function POST(request: Request) {
    const auth = await authenticateApp(request);
    if ("response" in auth) return auth.response;

    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return appJson({ error: issue?.message ?? "Check your booking details.", code: "invalid", field: issue?.path.join(".") }, 422);
    }
    const { slug, serviceIds, start, customer, address, notes, answers } = parsed.data;

    const placed = await placeBooking({
        slug,
        serviceIds,
        start,
        customer: { ...customer, email: auth.user.email.toLowerCase() },
        address,
        notes,
        answers,
    });
    if (!placed.ok) {
        // An app too old to show questions can't answer them: say how to fix that.
        if (placed.code === "answers_required" && answers === undefined) {
            return appError(409, "update_required", "This service asks a few questions when you book. Update the Swathbook app to book it.");
        }
        const status = placed.code === "failed" ? 500 : placed.code === "business_not_found" ? 404 : 409;
        return appError(status, placed.code, placed.error);
    }
    const { bookingId, token } = placed.booking;

    // Remember their name and phone for next time (only fills blanks).
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("full_name, phone").eq("id", auth.user.id).maybeSingle();
    if (profile && (!profile.full_name || (!profile.phone && customer.phone))) {
        await admin
            .from("profiles")
            .update({ full_name: profile.full_name || customer.fullName, phone: profile.phone || customer.phone || null })
            .eq("id", auth.user.id);
    }

    sendQueuedEmailsSoon(bookingId);

    const { data: booking } = await auth.supabase.rpc("my_booking", { p_booking_id: bookingId });
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    return appJson({ booking, manageUrl: `${site}${customerBookingPath(token)}` }, 201);
}
