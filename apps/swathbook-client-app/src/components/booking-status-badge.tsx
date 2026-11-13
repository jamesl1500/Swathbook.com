import { Badge, type BadgeTone } from '@/design-system';
import type { BookingStatus } from '@/data/types';

/** Same labels and colors as BookingStatusBadge on the website. */
const statusStyles: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: 'Awaiting deposit', tone: 'sun' },
  requested: { label: 'Requested', tone: 'sun' },
  confirmed: { label: 'Confirmed', tone: 'brand' },
  in_progress: { label: 'In progress', tone: 'brandSolid' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'clay' },
  no_show: { label: 'No-show', tone: 'clay' },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const style = statusStyles[status];
  return <Badge tone={style.tone}>{style.label}</Badge>;
}

export const bookingStatusLabel = (status: BookingStatus) => statusStyles[status].label;
