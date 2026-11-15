/**
 * The team's notification feed (my_notifications), worded for a person. Same
 * wording as the web dashboard's bell (apps/swathbook-web/src/libs/notifications.ts).
 */

import { formatCents, formatShortDate, formatTime } from '@swathbook/mobile/format';

export type NotificationItem = {
  id: string;
  type: string;
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

export type NotificationTone = 'new' | 'money' | 'change' | 'warning' | 'done';

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function at(iso: string, tz: string) {
  return `${formatShortDate(iso, tz)}, ${formatTime(iso, tz)}`;
}

export function describeNotification(item: NotificationItem, tz: string, currency = 'usd'): { title: string; body: string; tone: NotificationTone } {
  const who = item.customer_name?.trim() || 'A customer';
  const when = at(item.scheduled_start, tz);
  switch (item.type) {
    case 'created':
      return item.to_status === 'requested'
        ? { tone: 'warning', title: `New request from ${who}`, body: `Wants ${when}. Accept or decline it.` }
        : { tone: 'new', title: `New booking: ${who}`, body: when };
    case 'status_changed':
      if (item.from_status === 'pending_payment' && item.to_status === 'requested') {
        return { tone: 'warning', title: `New request from ${who}`, body: `Deposit paid for ${when}. Accept or decline it.` };
      }
      if (item.from_status === 'pending_payment') return { tone: 'new', title: `New booking: ${who}`, body: `Deposit paid for ${when}.` };
      if (item.to_status === 'cancelled') {
        const reason = text(item.data.reason);
        return { tone: 'warning', title: `${who}'s booking was cancelled`, body: reason ? `${when} · ${reason}` : when };
      }
      if (item.to_status === 'completed') return { tone: 'done', title: `Job done for ${who}`, body: when };
      if (item.to_status === 'in_progress') return { tone: 'change', title: `Job started for ${who}`, body: when };
      if (item.to_status === 'no_show') return { tone: 'warning', title: `${who} was marked a no-show`, body: when };
      return { tone: 'change', title: `${who}'s booking was updated`, body: when };
    case 'rescheduled': {
      const to = text(item.data.to_start);
      return { tone: 'change', title: `${who} rescheduled`, body: `Now ${to ? at(to, tz) : when}` };
    }
    case 'reassigned':
      return { tone: 'change', title: `${who}'s job was reassigned`, body: when };
    case 'payment': {
      const cents = typeof item.data.amount_cents === 'number' ? item.data.amount_cents : null;
      return { tone: 'money', title: cents ? `${formatCents(cents, currency)} received from ${who}` : `Payment received from ${who}`, body: `For ${when}` };
    }
    case 'cancel_requested': {
      const reason = text(item.data.reason);
      return { tone: 'warning', title: `${who} asked to cancel`, body: reason ? `${when} · “${reason}”` : `${when}. Approve or decline it.` };
    }
    case 'cancel_request_resolved':
      return { tone: 'change', title: item.data.approved ? `${who}'s cancellation was approved` : `${who}'s cancellation was declined`, body: when };
    default:
      return { tone: 'change', title: `${who}'s booking was updated`, body: when };
  }
}

/** "just now", "5m", "3h", "2d". */
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
