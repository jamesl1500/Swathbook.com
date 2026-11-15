import { describe, expect, it } from 'vitest';

import { bookingListArgs, isBookingView, PAGE_SIZE } from './booking-views';

const now = new Date('2026-11-14T15:00:00Z');
const base = { businessId: 'biz', search: '', page: 0, now };

describe('bookingListArgs', () => {
  it('lists upcoming active jobs from now, soonest first', () => {
    expect(bookingListArgs('upcoming', base)).toMatchObject({
      p_business_id: 'biz',
      p_statuses: ['pending_payment', 'requested', 'confirmed', 'in_progress'],
      p_from: now.toISOString(),
      p_to: undefined,
      p_newest_first: false,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    });
  });

  it('lists the past newest first, any status', () => {
    expect(bookingListArgs('past', base)).toMatchObject({ p_statuses: undefined, p_from: undefined, p_to: now.toISOString(), p_newest_first: true });
  });

  it('filters requests, cancellation requests and unpaid deposits', () => {
    expect(bookingListArgs('requests', base).p_statuses).toEqual(['requested']);
    expect(bookingListArgs('cancel', base)).toMatchObject({ p_cancel_requests: true });
    expect(bookingListArgs('deposit', base).p_statuses).toEqual(['pending_payment']);
  });

  it('pages, trims the search and limits crew to their own jobs', () => {
    expect(bookingListArgs('upcoming', { ...base, page: 2, search: '  rita  ', memberId: 'm1' })).toMatchObject({
      p_offset: 2 * PAGE_SIZE,
      p_search: 'rita',
      p_member_id: 'm1',
    });
    expect(bookingListArgs('upcoming', { ...base, search: '   ' }).p_search).toBeUndefined();
    expect(bookingListArgs('upcoming', { ...base, search: 'x'.repeat(200) }).p_search).toHaveLength(80);
  });
});

describe('isBookingView', () => {
  it('accepts only known views (it reads a route parameter)', () => {
    expect(isBookingView('requests')).toBe(true);
    expect(isBookingView('everything')).toBe(false);
    expect(isBookingView(undefined)).toBe(false);
  });
});
