/**
 * A job's timeline (booking_events), one short line each. Same wording as the
 * web dashboard's Activity tab.
 */

import { bookingStatusLabel, type BookingStatus } from '@swathbook/mobile/status';
import { formatCents, formatShortDate, formatTime } from '@swathbook/mobile/format';

export type JobEvent = { event_type: string; from_status: string | null; to_status: string | null; data: unknown };

function field(data: unknown, key: string) {
  return data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
}

function words(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function describeJobEvent(
  event: JobEvent,
  { timeZone, currency, team }: { timeZone: string; currency: string; team: { id: string; name: string }[] },
): { title: string; detail: string | null } {
  switch (event.event_type) {
    case 'created':
      return { title: field(event.data, 'source') === 'booking_page' ? 'Booked online' : 'Added by the team', detail: null };
    case 'status_changed': {
      if (event.from_status === 'pending_payment' && (event.to_status === 'confirmed' || event.to_status === 'requested')) {
        return { title: 'Deposit paid', detail: event.to_status === 'requested' ? 'Waiting for your OK' : 'Booking confirmed' };
      }
      const title = event.to_status ? bookingStatusLabel(event.to_status as BookingStatus) : 'Status changed';
      return { title, detail: event.to_status === 'cancelled' ? words(field(event.data, 'reason')) : null };
    }
    case 'rescheduled': {
      const to = words(field(event.data, 'to_start'));
      return { title: 'Rescheduled', detail: to ? `Now ${formatShortDate(to, timeZone)}, ${formatTime(to, timeZone)}` : null };
    }
    case 'reassigned': {
      const to = words(field(event.data, 'to_member_id'));
      return { title: 'Reassigned', detail: to ? `To ${team.find((person) => person.id === to)?.name ?? 'a teammate'}` : 'Now unassigned' };
    }
    case 'payment': {
      const cents = field(event.data, 'amount_cents');
      const kind = words(field(event.data, 'kind'));
      return {
        title: kind ? `${kind[0].toUpperCase()}${kind.slice(1)} payment received` : 'Payment received',
        detail: typeof cents === 'number' ? formatCents(cents, currency) : null,
      };
    }
    case 'cancel_requested': {
      const reason = words(field(event.data, 'reason'));
      return { title: 'Customer asked to cancel', detail: reason ? `“${reason}”` : null };
    }
    case 'cancel_request_resolved':
      return { title: field(event.data, 'approved') ? 'Cancellation approved' : 'Cancellation declined', detail: words(field(event.data, 'note')) };
    default:
      return { title: 'Updated', detail: null };
  }
}
