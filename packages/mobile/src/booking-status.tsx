import { Badge } from './design-system';
import { BOOKING_STATUSES, type BookingStatus } from './status';

export { bookingStatusLabel, type BookingStatus } from './status';

/** A booking's status as a pill: same labels and colors as BookingStatusBadge on the website. */
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const style = BOOKING_STATUSES[status];
  return <Badge tone={style.tone}>{style.label}</Badge>;
}
