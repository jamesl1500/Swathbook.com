/**
 * Display formatting, matching the web app's libs/utils.ts so prices and
 * durations read identically on both. Times are shown in the business's time
 * zone (like the website), falling back to the device's.
 */

import type { PriceType } from '@/data/types';

/** Cents as currency, e.g. 4550 -> "$45.50", 4500 -> "$45". */
export function formatCents(cents: number, currency = 'usd') {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  }).format(dollars);
}

/** A service's price label: "$45", "From $185" or "Quote". Same as the web booking flow. */
export function formatServicePrice(service: { price_type: PriceType; price_cents: number }, currency = 'usd') {
  if (service.price_type === 'quote') return 'Quote';
  const amount = formatCents(service.price_cents, currency);
  return service.price_type === 'starting_at' ? `From ${amount}` : amount;
}

/** Minutes as a duration, e.g. 45 -> "45 min", 90 -> "1 hr 30 min". */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached formatters; an unknown time zone falls back to the device's. */
function fmt(options: Intl.DateTimeFormatOptions, timeZone?: string) {
  const key = JSON.stringify([options, timeZone ?? '']);
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
    } catch {
      formatter = new Intl.DateTimeFormat('en-US', options);
    }
    formatters.set(key, formatter);
  }
  return formatter;
}

export const formatTime = (iso: string, tz?: string) => fmt({ hour: 'numeric', minute: '2-digit' }, tz).format(new Date(iso));

/** "Tue, Nov 12" */
export const formatShortDate = (iso: string, tz?: string) =>
  fmt({ weekday: 'short', month: 'short', day: 'numeric' }, tz).format(new Date(iso));

/** "Tuesday, November 12" */
export const formatLongDate = (iso: string, tz?: string) =>
  fmt({ weekday: 'long', month: 'long', day: 'numeric' }, tz).format(new Date(iso));

/** "Nov" */
export const formatMonth = (iso: string, tz?: string) => fmt({ month: 'short' }, tz).format(new Date(iso));

/** "12" */
export const formatDayOfMonth = (iso: string, tz?: string) => fmt({ day: 'numeric' }, tz).format(new Date(iso));

/** The calendar date in that zone, as YYYY-MM-DD (also what the database's date params take). */
export function dayKey(iso: string | Date, tz?: string) {
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, tz).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "Today", "Tomorrow", "Yesterday" or "Tue, Nov 12". */
export function formatRelativeDay(iso: string, tz?: string) {
  const diff = Math.round((Date.parse(dayKey(iso, tz)) - Date.parse(dayKey(new Date(), tz))) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatShortDate(iso, tz);
}

/** "9:30 AM – 10:15 AM" */
export const formatTimeRange = (startIso: string, endIso: string, tz?: string) => `${formatTime(startIso, tz)} – ${formatTime(endIso, tz)}`;

/** Business hours 'HH:MM:SS' -> "7:30 AM" (already local to the business). */
export function formatClock(value: string) {
  const [h, m] = value.split(':').map(Number);
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

/** Minutes between two timestamps. */
export const minutesBetween = (startIso: string, endIso: string) => Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);

export const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
