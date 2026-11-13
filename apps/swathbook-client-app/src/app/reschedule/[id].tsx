import { router, useLocalSearchParams } from 'expo-router';
import { CalendarCheck, CalendarX } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { serviceNames } from '@/components/job-card';
import { Loading, LoadError } from '@/components/query-state';
import { SlotPicker, useSlotDays } from '@/components/slot-picker';
import { ApiError, useMyBooking, useRescheduleBooking, useRescheduleSlots } from '@/data/api';
import type { CustomerBooking, Slot } from '@/data/types';
import { Button, EmptyState, FormMessage, Screen, SectionHeader, space, Text } from '@/design-system';
import { formatLongDate, formatShortDate, formatTime } from '@/lib/format';

export default function RescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = useMyBooking(id);
  if (booking.isPending) return <Loading />;
  if (booking.isError || !booking.data) {
    return (
      <Screen edges={['bottom']}>
        <LoadError onRetry={booking.refetch} />
      </Screen>
    );
  }
  return <Reschedule booking={booking.data} />;
}

function Reschedule({ booking }: { booking: CustomerBooking }) {
  const tz = booking.business.timezone;
  const slots = useRescheduleSlots(booking.id);
  const move = useRescheduleBooking();
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const slotDays = useSlotDays(slots.data, tz, day);

  function submit() {
    if (!slot) return;
    move.mutate(
      { id: booking.id, start: slot.slot_start },
      {
        onSuccess: () => router.back(),
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'slot_unavailable') {
            setSlot(null);
            void slots.refetch();
          }
        },
      },
    );
  }

  return (
    <Screen
      edges={[]}
      footer={
        <Button size="lg" block icon={CalendarCheck} disabled={!slot} loading={move.isPending} onPress={submit}>
          {slot ? `Move to ${formatShortDate(slot.slot_start, tz)}, ${formatTime(slot.slot_start, tz)}` : 'Pick a time'}
        </Button>
      }
    >
      <View>
        <Text variant="label" tone="brand">
          {booking.business.name}
        </Text>
        <Text variant="heading">{serviceNames(booking)}</Text>
        <Text tone="soft">
          Now: {formatLongDate(booking.scheduled_start, tz)} at {formatTime(booking.scheduled_start, tz)}
        </Text>
      </View>

      <View>
        <SectionHeader title="New time" />
        {slots.isPending ? (
          <Loading label="Loading open times" />
        ) : slots.isError ? (
          <LoadError onRetry={slots.refetch} />
        ) : slotDays.days.length === 0 ? (
          <EmptyState icon={CalendarX} title="No other openings soon">
            Call {booking.business.name} to find a time that works.
          </EmptyState>
        ) : (
          <View style={styles.stack}>
            <SlotPicker
              {...slotDays}
              tz={tz}
              slot={slot}
              onDay={(key) => {
                setDay(key);
                setSlot(null);
              }}
              onSlot={setSlot}
            />
          </View>
        )}
      </View>

      {move.isError ? <FormMessage tone="error">{move.error.message}</FormMessage> : null}
      <Text variant="caption" tone="faint">
        {booking.business.name} gets an email about the change. Your price stays the same.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[3],
  },
});
