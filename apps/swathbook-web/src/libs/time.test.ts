import { describe, expect, it } from "vitest";
import {
    addDays,
    dayRangeUtc,
    formatTimeKey,
    isDateKey,
    minutesIntoDay,
    startOfWeek,
    toDateKey,
    toTimeKey,
    weekdayOf,
    zonedToUtc,
} from "./time";

describe("zonedToUtc", () => {
    it("converts Central time in winter (UTC-6)", () => {
        expect(zonedToUtc("2026-01-15", "09:30", "America/Chicago").toISOString()).toBe("2026-01-15T15:30:00.000Z");
    });

    it("converts Central time in summer (UTC-5)", () => {
        expect(zonedToUtc("2026-07-15", "09:30", "America/Chicago").toISOString()).toBe("2026-07-15T14:30:00.000Z");
    });

    it("handles zones east of UTC", () => {
        expect(zonedToUtc("2026-07-15", "09:30", "Europe/Berlin").toISOString()).toBe("2026-07-15T07:30:00.000Z");
    });

    // Both DST cases match Postgres: ('2026-03-08'::date + '02:30'::time) at time zone 'America/Chicago'.
    it("rolls a time inside the spring-forward gap forward", () => {
        // 2:30 AM doesn't exist on 2026-03-08 in Chicago; it's treated as 3:30 AM CDT.
        expect(zonedToUtc("2026-03-08", "02:30", "America/Chicago").toISOString()).toBe("2026-03-08T08:30:00.000Z");
    });

    it("reads an ambiguous fall-back time as standard time", () => {
        // 1:30 AM happens twice on 2026-11-01; Postgres picks the second (CST).
        expect(zonedToUtc("2026-11-01", "01:30", "America/Chicago").toISOString()).toBe("2026-11-01T07:30:00.000Z");
    });

    it("round-trips with toDateKey/toTimeKey", () => {
        const instant = zonedToUtc("2026-11-01", "23:45", "America/Los_Angeles");
        expect(toDateKey(instant, "America/Los_Angeles")).toBe("2026-11-01");
        expect(toTimeKey(instant, "America/Los_Angeles")).toBe("23:45");
        expect(minutesIntoDay(instant, "America/Los_Angeles")).toBe(23 * 60 + 45);
    });
});

describe("date keys", () => {
    it("does calendar arithmetic across months and years", () => {
        expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
        expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    });

    it("knows weekdays and week starts (Sunday)", () => {
        expect(weekdayOf("2026-10-23")).toBe(5);
        expect(startOfWeek("2026-10-23")).toBe("2026-10-18");
        expect(startOfWeek("2026-10-18")).toBe("2026-10-18");
    });

    it("validates keys", () => {
        expect(isDateKey("2026-02-28")).toBe(true);
        expect(isDateKey("2026-02-30")).toBe(false);
        expect(isDateKey("10/23/2026")).toBe(false);
        expect(isDateKey(null)).toBe(false);
    });

    it("builds a UTC range for whole local days, including DST changes", () => {
        const { start, end } = dayRangeUtc("2026-11-01", "2026-11-02", "America/Chicago");
        expect(start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
        expect(end.toISOString()).toBe("2026-11-02T06:00:00.000Z"); // 25-hour day
    });
});

describe("formatTimeKey", () => {
    it.each([
        ["00:00", "12:00 AM"],
        ["09:05", "9:05 AM"],
        ["12:30", "12:30 PM"],
        ["17:00", "5:00 PM"],
    ])("%s -> %s", (key, label) => {
        expect(formatTimeKey(key)).toBe(label);
    });
});
