/**
 * notifications.ts
 *
 * The team's notification feed (my_notifications): what changed on the
 * business's jobs, worded for a person. Shared by the header bell, its toasts
 * and desktop alerts.
 *
 * @module src/libs/notifications
 * @since 1.0.0
 */

import { bookingPath } from "./routes";
import { formatDateTime } from "./time";
import { formatCents } from "./utils";

export type NotificationItem = {
    id: string;
    type: "created" | "status_changed" | "rescheduled" | "reassigned" | "payment" | "note" | "cancel_requested" | "cancel_request_resolved";
    from_status: string | null;
    to_status: string | null;
    data: Record<string, unknown>;
    created_at: string;
    booking_id: string;
    reference: string;
    scheduled_start: string;
    customer_name: string | null;
    unread: boolean;
};

export type NotificationFeed = { unread: number; items: NotificationItem[] };

export const EMPTY_FEED: NotificationFeed = { unread: 0, items: [] };

export type NotificationTone = "new" | "money" | "change" | "warning" | "done";

export type DescribedNotification = { title: string; body: string; href: string; tone: NotificationTone };

function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** One feed item as a person reads it. Times are in the business's zone. */
export function describeNotification(item: NotificationItem, timeZone: string, currency = "usd"): DescribedNotification {
    const who = item.customer_name?.trim() || "A customer";
    const when = formatDateTime(item.scheduled_start, timeZone);
    const href = bookingPath(item.booking_id);
    const base = { href };

    switch (item.type) {
        case "created":
            return item.to_status === "requested"
                ? { ...base, tone: "warning", title: `New request from ${who}`, body: `Wants ${when}. Accept or decline it.` }
                : { ...base, tone: "new", title: `New booking: ${who}`, body: when };
        case "status_changed":
            if (item.from_status === "pending_payment" && item.to_status === "requested") {
                return { ...base, tone: "warning", title: `New request from ${who}`, body: `Deposit paid for ${when}. Accept or decline it.` };
            }
            if (item.from_status === "pending_payment") {
                return { ...base, tone: "new", title: `New booking: ${who}`, body: `Deposit paid for ${when}.` };
            }
            switch (item.to_status) {
                case "confirmed":
                    return { ...base, tone: "new", title: `${who}'s booking is confirmed`, body: when };
                case "cancelled": {
                    const reason = text(item.data.reason);
                    return { ...base, tone: "warning", title: `${who}'s booking was cancelled`, body: reason ? `${when} · ${reason}` : when };
                }
                case "in_progress":
                    return { ...base, tone: "change", title: `Job started for ${who}`, body: when };
                case "completed":
                    return { ...base, tone: "done", title: `Job done for ${who}`, body: when };
                case "no_show":
                    return { ...base, tone: "warning", title: `${who} was marked a no-show`, body: when };
                default:
                    return { ...base, tone: "change", title: `${who}'s booking was updated`, body: when };
            }
        case "rescheduled": {
            const to = text(item.data.to_start);
            return { ...base, tone: "change", title: `${who} rescheduled`, body: `Now ${to ? formatDateTime(to, timeZone) : when}` };
        }
        case "reassigned":
            return { ...base, tone: "change", title: `${who}'s job was reassigned`, body: when };
        case "payment": {
            const cents = typeof item.data.amount_cents === "number" ? item.data.amount_cents : null;
            return {
                ...base,
                tone: "money",
                title: cents ? `${formatCents(cents, currency)} received from ${who}` : `Payment received from ${who}`,
                body: `For ${when}`,
            };
        }
        case "cancel_requested": {
            const reason = text(item.data.reason);
            return { ...base, tone: "warning", title: `${who} asked to cancel`, body: reason ? `${when} · "${reason}"` : `${when}. Approve or decline it.` };
        }
        case "cancel_request_resolved":
            return {
                ...base,
                tone: "change",
                title: item.data.approved ? `${who}'s cancellation was approved` : `${who}'s cancellation was declined`,
                body: when,
            };
        default:
            return { ...base, tone: "change", title: `${who}'s booking was updated`, body: when };
    }
}

/** "just now", "5m", "3h", "2d": for the feed. */
export function timeAgo(iso: string, now = Date.now()) {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}
