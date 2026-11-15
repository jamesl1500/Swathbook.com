/**
 * Booking statuses: labels and badge tones, the same as the website's
 * BookingStatusBadge. Plain TypeScript (no React Native), so rules and tests
 * can use the labels without loading any UI.
 */

/** A booking's status (the database's booking_status). */
export type BookingStatus = 'pending_payment' | 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type StatusTone = 'sun' | 'brand' | 'brandSolid' | 'neutral' | 'clay';

export const BOOKING_STATUSES: Record<BookingStatus, { label: string; tone: StatusTone }> = {
  pending_payment: { label: 'Awaiting deposit', tone: 'sun' },
  requested: { label: 'Requested', tone: 'sun' },
  confirmed: { label: 'Confirmed', tone: 'brand' },
  in_progress: { label: 'In progress', tone: 'brandSolid' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'clay' },
  no_show: { label: 'No-show', tone: 'clay' },
};

export const bookingStatusLabel = (status: BookingStatus) => BOOKING_STATUSES[status].label;
