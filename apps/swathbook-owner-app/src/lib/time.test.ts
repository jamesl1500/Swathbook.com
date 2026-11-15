import { describe, expect, it } from 'vitest';

import { addDays, dateKeyIn, dayRange, startOfDay } from './time';

describe('days in the business time zone', () => {
  it("uses the business's date, not the phone's", () => {
    // 11:30 PM on the 14th in Chicago is already the 15th in UTC.
    expect(dateKeyIn(new Date('2026-11-15T05:30:00Z'), 'America/Chicago')).toBe('2026-11-14');
    expect(dateKeyIn(new Date('2026-11-15T05:30:00Z'), 'UTC')).toBe('2026-11-15');
  });

  it('finds local midnight', () => {
    expect(startOfDay('2026-11-14', 'America/Chicago').toISOString()).toBe('2026-11-14T06:00:00.000Z');
    expect(startOfDay('2026-07-14', 'America/Chicago').toISOString()).toBe('2026-07-14T05:00:00.000Z');
    expect(startOfDay('2026-11-14', 'Asia/Tokyo').toISOString()).toBe('2026-11-13T15:00:00.000Z');
  });

  it('gives a whole day, including the short and long days around daylight saving', () => {
    expect(dayRange('2026-11-14', 'America/Chicago')).toEqual({ from: '2026-11-14T06:00:00.000Z', to: '2026-11-15T06:00:00.000Z' });
    // Spring forward (Mar 8, 2026): a 23-hour day.
    const spring = dayRange('2026-03-08', 'America/Chicago');
    expect(Date.parse(spring.to) - Date.parse(spring.from)).toBe(23 * 3_600_000);
    // Fall back (Nov 1, 2026): a 25-hour day.
    const fall = dayRange('2026-11-01', 'America/Chicago');
    expect(Date.parse(fall.to) - Date.parse(fall.from)).toBe(25 * 3_600_000);
  });

  it('adds calendar days across months', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
