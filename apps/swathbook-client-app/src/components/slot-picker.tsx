import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { Slot } from '@/data/types';
import { Chip, space } from '@/design-system';
import { dayKey, formatShortDate, formatTime } from '@/lib/format';

export type SlotDays = {
  /** Openings grouped by the business's local day, in order. */
  days: [string, Slot[]][];
  /** The chosen day, or the first one when the choice is gone (or there isn't one). */
  activeDay: string | null;
  daySlots: Slot[];
};

export function useSlotDays(slots: Slot[] | undefined, tz: string, day: string | null): SlotDays {
  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const key = dayKey(s.slot_start, tz);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()];
  }, [slots, tz]);
  const activeDay = day !== null && days.some(([key]) => key === day) ? day : (days[0]?.[0] ?? null);
  const daySlots = days.find(([key]) => key === activeDay)?.[1] ?? [];
  return { days, activeDay, daySlots };
}

type SlotPickerProps = SlotDays & {
  tz: string;
  slot: Slot | null;
  onDay: (day: string) => void;
  onSlot: (slot: Slot) => void;
  /** After the day chips, e.g. a "Later" button. */
  moreDays?: ReactNode;
};

/** Day chips, then that day's times: the open-time picker for booking and rescheduling. */
export function SlotPicker({ days, activeDay, daySlots, tz, slot, onDay, onSlot, moreDays }: SlotPickerProps) {
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} role="radiogroup" aria-label="Day">
        {days.map(([key, list]) => (
          <Chip key={key} selected={key === activeDay} onPress={() => onDay(key)} aria-label={`${formatShortDate(list[0].slot_start, tz)}, ${list.length} times`}>
            {formatShortDate(list[0].slot_start, tz)}
          </Chip>
        ))}
        {moreDays}
      </ScrollView>
      <View style={styles.times} role="radiogroup" aria-label="Time">
        {daySlots.map((s) => (
          <Chip key={s.slot_start} shape="tile" selected={slot?.slot_start === s.slot_start} onPress={() => onSlot(s)} style={styles.time}>
            {formatTime(s.slot_start, tz)}
          </Chip>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: space[2], paddingRight: space[4] },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  time: { minWidth: 92 },
});
