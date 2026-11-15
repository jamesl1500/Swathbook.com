/**
 * The Bookings tab's views, as booking_list parameters (the same views as the
 * web dashboard's Bookings page).
 */

import type { BookingStatus } from '@swathbook/mobile/status';

export type BookingView = 'upcoming' | 'requests' | 'cancel' | 'deposit' | 'past';

export const BOOKING_VIEWS: { id: BookingView; label: string; managersOnly?: boolean; countKey?: string; empty: string }[] = [
  { id: 'upcoming', label: 'Upcoming', countKey: 'upcoming', empty: 'No upcoming jobs. Share your booking link, or add a job on the website.' },
  { id: 'requests', label: 'Requests', countKey: 'requests', managersOnly: true, empty: 'No requests waiting for your OK.' },
  { id: 'cancel', label: 'Cancel requests', countKey: 'cancel_requests', managersOnly: true, empty: 'No one has asked to cancel.' },
  { id: 'deposit', label: 'Awaiting deposit', countKey: 'awaiting_deposit', empty: 'No one is mid-checkout right now.' },
  { id: 'past', label: 'Past', empty: 'Nothing in the past yet.' },
];

export const PAGE_SIZE = 25;

const ACTIVE: BookingStatus[] = ['pending_payment', 'requested', 'confirmed', 'in_progress'];

export function isBookingView(value: unknown): value is BookingView {
  return typeof value === 'string' && BOOKING_VIEWS.some((view) => view.id === value);
}

/** booking_list's arguments for a view, one page at a time. Crew only ever see their own jobs. */
export function bookingListArgs(
  view: BookingView,
  { businessId, search, page, memberId, now = new Date() }: { businessId: string; search: string; page: number; memberId?: string | null; now?: Date },
) {
  const nowIso = now.toISOString();
  const statuses: Record<BookingView, BookingStatus[] | undefined> = {
    upcoming: ACTIVE,
    requests: ['requested'],
    cancel: ['confirmed', 'requested', 'in_progress'],
    deposit: ['pending_payment'],
    past: undefined,
  };
  return {
    p_business_id: businessId,
    p_statuses: statuses[view],
    p_from: view === 'upcoming' ? nowIso : undefined,
    p_to: view === 'past' ? nowIso : undefined,
    p_member_id: memberId ?? undefined,
    p_cancel_requests: view === 'cancel',
    p_search: search.trim().slice(0, 80) || undefined,
    p_newest_first: view === 'past',
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  };
}
