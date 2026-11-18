/**
 * job-report.ts
 *
 * The customer's job report (/booking/<token>/report): the crew's before and
 * after photos and note, when they were there, what it cost, and the tip and
 * review prompts. Like the manage-booking page, the booking's public token is
 * the only credential, so this reads with the service role and returns only
 * what the customer should see. Photos live in a private bucket and get
 * short-lived links.
 *
 * @module src/libs/job-report
 * @since 1.0.0
 */

import { cache } from "react";
import { isBookingToken } from "./customer-booking";
import { maxTipCents, MIN_TIP_CENTS, TIP_WINDOW_DAYS } from "./stripe/payments";
import { createAdminClient } from "./supabase/admin";
import { JOB_FILES_BUCKET } from "./supabase/storage";

const PHOTO_LINK_SECONDS = 60 * 60;

export type ReportPhoto = { id: string; url: string; phase: "before" | "after" };

export const loadJobReport = cache(async (token: string) => {
    if (!isBookingToken(token)) return null;
    const admin = createAdminClient();
    const { data: booking } = await admin
        .from("bookings")
        .select(
            `id, reference, status, public_token, scheduled_start, started_at, completed_at, report_note, currency,
             subtotal_cents, discount_cents, discount_reason, tip_cents, total_cents, amount_paid_cents, amount_refunded_cents,
             balance_due_cents, measured_area_sqft,
             business_members(display_name),
             businesses(name, slug, phone, timezone, brand_color, logo_path, google_review_url, tips_enabled, stripe_connect_accounts(charges_enabled)),
             booking_items(name, quantity, line_total_cents, sort_order),
             booking_attachments(id, storage_path, phase, created_at),
             payments(kind, status, amount_cents, stripe_payment_intent_id)`,
        )
        .eq("public_token", token)
        .maybeSingle();
    if (!booking?.businesses) return null;

    const files = [...booking.booking_attachments]
        .filter((file): file is typeof file & { phase: "before" | "after" } => file.phase === "before" || file.phase === "after")
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const { data: signed } = files.length
        ? await admin.storage.from(JOB_FILES_BUCKET).createSignedUrls(files.map((file) => file.storage_path), PHOTO_LINK_SECONDS)
        : { data: [] };
    const photos: ReportPhoto[] = files.flatMap((file, index) => {
        const url = signed?.[index]?.signedUrl;
        return url ? [{ id: file.id, url, phase: file.phase }] : [];
    });

    const business = booking.businesses;
    const connect = Array.isArray(business.stripe_connect_accounts) ? business.stripe_connect_accounts[0] : business.stripe_connect_accounts;
    const jobTotalCents = booking.subtotal_cents - booking.discount_cents;

    return {
        booking,
        business,
        photos,
        crewName: booking.business_members?.display_name?.split(/\s+/)[0] ?? null,
        jobTotalCents,
        acceptsPayments: Boolean(connect?.charges_enabled),
        tipping: tippingFor({ ...booking, tips_enabled: business.tips_enabled, accepts_payments: Boolean(connect?.charges_enabled) }, jobTotalCents),
    };
});

export type JobReport = NonNullable<Awaited<ReturnType<typeof loadJobReport>>>;

/** Whether to offer a tip, with suggested amounts (whole dollars, never under $1). */
export function tippingFor(
    booking: { status: string; completed_at: string | null; tips_enabled: boolean; accepts_payments: boolean },
    jobTotalCents: number,
    now = Date.now(),
) {
    const open =
        booking.status === "completed" &&
        booking.tips_enabled &&
        booking.accepts_payments &&
        (!booking.completed_at || now - Date.parse(booking.completed_at) <= TIP_WINDOW_DAYS * 86_400_000);
    if (!open) return null;
    // Percentages of a real total, else flat amounts for a quote-only job.
    const suggestions =
        jobTotalCents >= 2_000
            ? [15, 20, 25].map((percent) => ({ label: `${percent}%`, cents: Math.max(MIN_TIP_CENTS, Math.round((jobTotalCents * percent) / 10_000) * 100) }))
            : [500, 1_000, 2_000].map((cents) => ({ label: null, cents }));
    return { suggestions, minCents: MIN_TIP_CENTS, maxCents: maxTipCents(jobTotalCents) };
}
