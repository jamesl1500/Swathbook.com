import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge, colors, PressableCard, radius, space, Text } from '@/design-system';
import type { CustomerBooking } from '@/data/types';
import { formatDayOfMonth, formatMonth, formatRelativeDay, formatTimeRange } from '@/lib/format';

import { BookingStatusBadge, bookingStatusLabel } from './booking-status-badge';

export const serviceNames = (booking: CustomerBooking) => booking.items.map((item) => item.name).join(', ') || 'Booking';

/** A job in a list: a calendar tile, what and who, when, and its status. */
export function JobCard({ booking }: { booking: CustomerBooking }) {
  const tz = booking.business.timezone;
  const muted = booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'no_show';
  const names = serviceNames(booking);

  return (
    <PressableCard
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: booking.id } })}
      aria-label={`${names} with ${booking.business.name}, ${formatRelativeDay(booking.scheduled_start, tz)}, ${bookingStatusLabel(booking.status)}`}
      style={styles.card}
    >
      <View style={[styles.dateTile, muted && styles.dateTileMuted]} aria-hidden>
        <Text variant="label" tone={muted ? 'faint' : 'sky'} style={styles.month}>
          {formatMonth(booking.scheduled_start, tz)}
        </Text>
        <Text variant="heading" tone={muted ? 'soft' : 'paper'} style={styles.day}>
          {formatDayOfMonth(booking.scheduled_start, tz)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {names}
        </Text>
        <Text variant="small" tone="soft" numberOfLines={1}>
          {booking.business.name}
        </Text>
        <Text variant="small" tone="faint" numberOfLines={1}>
          {formatRelativeDay(booking.scheduled_start, tz)} · {formatTimeRange(booking.scheduled_start, booking.scheduled_end, tz)}
        </Text>
        <View style={styles.badges}>
          <BookingStatusBadge status={booking.status} />
          {booking.cancel_requested_at ? <Badge tone="clay">Cancel requested</Badge> : null}
        </View>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space[4],
    alignItems: 'flex-start',
  },
  dateTile: {
    width: 56,
    paddingVertical: space[2],
    borderRadius: radius.lg,
    backgroundColor: colors.brand600,
    alignItems: 'center',
  },
  dateTileMuted: {
    backgroundColor: colors.paperDeep,
  },
  month: {
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
  day: {
    lineHeight: 28,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space[0.5],
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1.5],
    marginTop: space[2],
  },
});
