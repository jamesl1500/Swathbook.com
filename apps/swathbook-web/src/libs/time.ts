/**
 * time.ts
 *
 * Time-zone helpers built on Intl. Businesses work in their own local time
 * (business.timezone) while the database stores UTC instants, so pages pass
 * "date keys" (YYYY-MM-DD) and "time keys" (HH:MM) around and convert at the edges.
 *
 * @module src/libs/time
 * @since 1.0.0
 */

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
    let formatter = partsFormatterCache.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        partsFormatterCache.set(timeZone, formatter);
    }
    return formatter;
}

function zonedParts(date: Date, timeZone: string) {
    const parts = Object.fromEntries(
        partsFormatter(timeZone)
            .formatToParts(date)
            .map((part) => [part.type, part.value]),
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
    };
}

/** Milliseconds the zone is ahead of UTC at `date` (negative west of Greenwich). */
function offsetMs(date: Date, timeZone: string) {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The UTC instant for a wall-clock date and time in `timeZone`, resolved the
 * same way as Postgres' `timestamp AT TIME ZONE` (see the DST tests).
 */
export function zonedToUtc(dateKey: string, timeKey: string, timeZone: string): Date {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hour, minute] = timeKey.split(":").map(Number);
    const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    // Offsets 12h either side straddle any DST transition near this wall time.
    const halfDay = 12 * 60 * 60 * 1000;
    const before = wallAsUtc - offsetMs(new Date(wallAsUtc - halfDay), timeZone);
    const after = wallAsUtc - offsetMs(new Date(wallAsUtc + halfDay), timeZone);
    const reproducesWall = (instant: number) => {
        const p = zonedParts(new Date(instant), timeZone);
        return p.hour === hour && p.minute === minute && p.day === day;
    };
    // Match Postgres (where slots are generated): an ambiguous fall-back time
    // means standard time (the later instant), and a time in the spring-forward
    // gap rolls forward.
    const valid = [before, after].filter(reproducesWall);
    return new Date(valid.length ? Math.max(...valid) : Math.max(before, after));
}

/** YYYY-MM-DD for `date` in `timeZone`. */
export function toDateKey(date: Date, timeZone: string) {
    const p = zonedParts(date, timeZone);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** HH:MM (24h) for `date` in `timeZone`. */
export function toTimeKey(date: Date, timeZone: string) {
    const p = zonedParts(date, timeZone);
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Minutes since local midnight for `date` in `timeZone`. */
export function minutesIntoDay(date: Date, timeZone: string) {
    const p = zonedParts(date, timeZone);
    return p.hour * 60 + p.minute;
}

export function todayKey(timeZone: string, now = new Date()) {
    return toDateKey(now, timeZone);
}

export function isDateKey(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Calendar arithmetic on date keys (no time zone involved). */
export function addDays(dateKey: string, days: number) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, matching business_hours.weekday. */
export function weekdayOf(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The Sunday on or before `dateKey`. */
export function startOfWeek(dateKey: string) {
    return addDays(dateKey, -weekdayOf(dateKey));
}

/** The UTC range covering whole local days [fromKey, toKey). */
export function dayRangeUtc(fromKey: string, toKeyExclusive: string, timeZone: string) {
    return { start: zonedToUtc(fromKey, "00:00", timeZone), end: zonedToUtc(toKeyExclusive, "00:00", timeZone) };
}

export function formatTime(date: Date | string, timeZone: string) {
    return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

export function formatDateLong(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(
        new Date(Date.UTC(year, month - 1, day)),
    );
}

export function formatDateShort(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
        new Date(Date.UTC(year, month - 1, day)),
    );
}

export function formatDateTime(date: Date | string, timeZone: string) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(date));
}

/** "HH:MM" -> "9:30 AM". */
export function formatTimeKey(timeKey: string) {
    const [hour, minute] = timeKey.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
