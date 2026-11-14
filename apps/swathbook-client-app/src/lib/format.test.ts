import { describe, expect, it } from 'vitest';

import { dayKey, formatCents, formatClock, formatDuration, formatServicePrice, formatTimeRange, minutesBetween } from './format';
import { tradeName } from './trades';

describe('money and durations', () => {
  it('formats cents like the website', () => {
    expect(formatCents(4500)).toBe('$45');
    expect(formatCents(4550)).toBe('$45.50');
    expect(formatServicePrice({ price_type: 'starting_at', price_cents: 18500 })).toBe('From $185');
    expect(formatServicePrice({ price_type: 'quote', price_cents: 0 })).toBe('Quote');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1 hr 30 min');
  });
});

describe('times', () => {
  it("shows times in the business's zone", () => {
    expect(formatTimeRange('2026-11-14T15:00:00Z', '2026-11-14T16:30:00Z', 'America/Chicago')).toBe('9:00 AM – 10:30 AM');
    expect(dayKey('2026-11-15T03:00:00Z', 'America/Chicago')).toBe('2026-11-14');
  });

  it('falls back to the device zone for an unknown one', () => {
    expect(() => formatTimeRange('2026-11-14T15:00:00Z', '2026-11-14T16:00:00Z', 'Not/AZone')).not.toThrow();
  });

  it('reads business hours and spans', () => {
    expect(formatClock('07:30:00')).toBe('7:30 AM');
    expect(minutesBetween('2026-11-14T15:00:00Z', '2026-11-14T16:15:00Z')).toBe(75);
  });
});

describe('tradeName', () => {
  it('names known trades and tidies unknown ones', () => {
    expect(tradeName('lawn-care')).toBe('Lawn mowing');
    expect(tradeName('window_washing')).toBe('Window washing');
    expect(tradeName('')).toBe('Local services');
  });
});
