/**
 * Grouping the bookings list by day, in the business's time zone.
 */

import { addDays, formatDateShort, toDateKey } from "@/libs/time";

/** Rows (already in list order) grouped into consecutive days in the business's time zone. */
export function groupByDay<T extends { scheduled_start: string }>(rows: T[], timeZone: string) {
  const groups: Array<{ dateKey: string; rows: T[] }> = [];
  for (const row of rows) {
    const dateKey = toDateKey(new Date(row.scheduled_start), timeZone);
    const last = groups.at(-1);
    if (last?.dateKey === dateKey) last.rows.push(row);
    else groups.push({ dateKey, rows: [row] });
  }
  return groups;
}

/** "Today", "Tomorrow", "Yesterday", or the short date. */
export function dayLabel(dateKey: string, today: string) {
  if (dateKey === today) return "Today";
  if (dateKey === addDays(today, 1)) return "Tomorrow";
  if (dateKey === addDays(today, -1)) return "Yesterday";
  return formatDateShort(dateKey);
}
