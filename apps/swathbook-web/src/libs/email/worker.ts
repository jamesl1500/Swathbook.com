/**
 * worker.ts
 *
 * Sends queued booking emails (public.notifications). Runs right after the
 * request that queued them (via after()), and every minute from pg_cron as a
 * safety net. Claims are leased in the database, so overlapping runs never
 * send the same email twice.
 *
 * @module src/libs/email/worker
 * @since 1.0.0
 */

import { after } from "next/server";
import { formatAddress } from "@/libs/address";
import { siteConfig } from "@/libs/globals/site";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";
import type { Database } from "@/libs/supabase/database.types";
import { sendEmail } from "./send";
import { bookingTemplates, type BookingEmailContext } from "./templates";

type Admin = ReturnType<typeof createAdminClient>;
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

const MAX_ATTEMPTS = 5;

export function emailBaseUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

const BOOKING_FIELDS = `id, reference, public_token, status, scheduled_start, scheduled_end, currency, total_cents,
    deposit_due_cents, deposit_paid_cents, hold_expires_at, cancellation_reason,
    businesses(name, slug, brand_color, timezone, phone, email, cancellation_window_hours),
    customers(full_name), customer_addresses(line1, line2, city, region, postal_code), booking_items(name, sort_order)`;

async function loadContext(admin: Admin, row: NotificationRow) {
    if (!row.booking_id) return null;
    const { data } = await admin.from("bookings").select(BOOKING_FIELDS).eq("id", row.booking_id).maybeSingle();
    if (!data?.businesses) return null;
    const context: BookingEmailContext = {
        baseUrl: emailBaseUrl(),
        business: {
            name: data.businesses.name,
            slug: data.businesses.slug,
            brandColor: data.businesses.brand_color,
            timezone: data.businesses.timezone,
            phone: data.businesses.phone,
            email: data.businesses.email,
            cancellationWindowHours: data.businesses.cancellation_window_hours,
        },
        customer: { name: data.customers?.full_name?.split(/\s+/)[0] || "there", fullName: data.customers?.full_name || "A customer" },
        booking: {
            id: data.id,
            reference: data.reference,
            publicToken: data.public_token,
            start: data.scheduled_start,
            end: data.scheduled_end,
            currency: data.currency,
            totalCents: data.total_cents ?? 0,
            depositDueCents: data.deposit_due_cents,
            depositPaidCents: data.deposit_paid_cents,
            holdExpiresAt: data.hold_expires_at,
            cancellationReason: data.cancellation_reason,
        },
        services: [...data.booking_items].sort((a, b) => a.sort_order - b.sort_order).map((item) => item.name),
        address: data.customer_addresses ? formatAddress(data.customer_addresses) : null,
        payload: (row.payload ?? {}) as Record<string, unknown>,
    };
    return { context, status: data.status };
}

/** Why an email queued earlier should no longer go out, or null to send it. */
export function staleReason(template: string, status: string, context: BookingEmailContext, now = Date.now()) {
    switch (template) {
        case "booking.deposit_reminder":
            if (status !== "pending_payment") return "deposit already resolved";
            if (!context.booking.holdExpiresAt || Date.parse(context.booking.holdExpiresAt) <= now) return "hold expired";
            return null;
        case "booking.reminder":
            if (status !== "confirmed") return "booking no longer confirmed";
            if (Date.parse(context.booking.start) <= now) return "already started";
            return null;
        case "booking.cancelled":
        case "booking.hold_expired":
            return status === "cancelled" ? null : "booking was restored";
        default:
            return status === "cancelled" ? "booking was cancelled" : null;
    }
}

export type WorkerResult = { claimed: number; sent: number; skipped: number; failed: number };

export async function processNotifications(admin: Admin, { limit = 25, bookingId }: { limit?: number; bookingId?: string } = {}): Promise<WorkerResult> {
    const result: WorkerResult = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
    const { data: rows, error } = await admin.rpc("claim_notifications", { p_limit: limit, ...(bookingId ? { p_booking_id: bookingId } : {}) });
    if (error) throw error;
    result.claimed = rows?.length ?? 0;

    for (const row of rows ?? []) {
        const template = Object.hasOwn(bookingTemplates, row.template) ? bookingTemplates[row.template] : undefined;
        const loaded = await loadContext(admin, row);
        if (!template || !loaded) {
            await admin.from("notifications").update({ status: "failed", error: template ? "Booking not found" : `Unknown template ${row.template}` }).eq("id", row.id);
            result.failed += 1;
            continue;
        }

        const stale = staleReason(row.template, loaded.status, loaded.context);
        if (stale) {
            await admin.from("notifications").update({ status: "canceled", error: stale }).eq("id", row.id);
            result.skipped += 1;
            continue;
        }

        const email = template(loaded.context);
        const sent = await sendEmail({ to: row.to_address, ...email, idempotencyKey: `notification:${row.id}` });
        if (sent.ok) {
            await admin
                .from("notifications")
                .update({ status: "sent", sent_at: new Date().toISOString(), provider: sent.provider, provider_message_id: sent.id, error: null })
                .eq("id", row.id);
            result.sent += 1;
        } else {
            const giveUp = row.attempts >= MAX_ATTEMPTS || sent.provider === "none";
            await admin
                .from("notifications")
                .update(
                    giveUp
                        ? { status: "failed", error: sent.error }
                        : { error: sent.error, scheduled_for: new Date(Date.now() + row.attempts ** 2 * 60_000).toISOString() },
                )
                .eq("id", row.id);
            result.failed += 1;
        }
    }
    return result;
}

/**
 * Sends anything a request just queued once the response is out, so customers
 * get their email in seconds without waiting for the minute-by-minute sweep.
 */
export function sendQueuedEmailsSoon(bookingId?: string) {
    if (!hasAdminClient()) return;
    after(async () => {
        try {
            await processNotifications(createAdminClient(), { bookingId });
        } catch (error) {
            console.error("[email] worker failed", error);
        }
    });
}
