/**
 * Days in the business's time zone. A job's "day" is the business's day, not
 * the phone's, so a crew member travelling still sees the right schedule.
 */

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(date: Date, timeZone: string): Parts {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute };
}

function offsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** YYYY-MM-DD for `date` in `timeZone`. */
export function dateKeyIn(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Calendar arithmetic on YYYY-MM-DD keys. */
export function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The instant local midnight starts `dateKey` in `timeZone` (DST-safe). */
export function startOfDay(dateKey: string, timeZone: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day);
  // Try the offsets either side of midnight; on a DST change one of them is right.
  const candidates = [wallAsUtc - offsetMs(new Date(wallAsUtc - 12 * 3_600_000), timeZone), wallAsUtc - offsetMs(new Date(wallAsUtc + 12 * 3_600_000), timeZone)];
  const matches = candidates.filter((instant) => dateKeyIn(new Date(instant), timeZone) === dateKey && zonedParts(new Date(instant), timeZone).hour === 0);
  return new Date(Math.min(...(matches.length ? matches : candidates)));
}

/** [start, end) of a whole local day, as ISO strings for the database. */
export function dayRange(dateKey: string, timeZone: string) {
  return { from: startOfDay(dateKey, timeZone).toISOString(), to: startOfDay(addDays(dateKey, 1), timeZone).toISOString() };
}
