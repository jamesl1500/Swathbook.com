import { describe, expect, it } from 'vitest';

import { describeJobEvent } from './job-events';
import { describeNotification, timeAgo, type NotificationItem } from './notifications';
import { signInMessage } from './sign-in-message';

const TZ = 'America/Chicago';

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: '1',
    type: 'created',
    from_status: null,
    to_status: 'confirmed',
    data: {},
    created_at: '2026-11-14T15:00:00Z',
    booking_id: 'b1',
    reference: 'AB12',
    scheduled_start: '2026-11-16T15:00:00Z',
    customer_name: 'Pat Customer',
    unread: true,
    ...overrides,
  };
}

describe('describeNotification', () => {
  it('words new bookings and requests', () => {
    expect(describeNotification(item({}), TZ)).toEqual({ tone: 'new', title: 'New booking: Pat Customer', body: 'Mon, Nov 16, 9:00 AM' });
    expect(describeNotification(item({ to_status: 'requested' }), TZ).title).toBe('New request from Pat Customer');
    expect(describeNotification(item({ type: 'status_changed', from_status: 'pending_payment', to_status: 'confirmed' }), TZ).body).toBe(
      'Deposit paid for Mon, Nov 16, 9:00 AM.',
    );
  });

  it('words payments, reschedules and cancellations', () => {
    expect(describeNotification(item({ type: 'payment', data: { amount_cents: 13500 } }), TZ)).toMatchObject({ tone: 'money', title: '$135 received from Pat Customer' });
    expect(describeNotification(item({ type: 'rescheduled', data: { to_start: '2026-11-18T20:30:00Z' } }), TZ).body).toBe('Now Wed, Nov 18, 2:30 PM');
    expect(describeNotification(item({ type: 'cancel_requested', data: { reason: 'Moving' } }), TZ)).toMatchObject({
      tone: 'warning',
      body: 'Mon, Nov 16, 9:00 AM · “Moving”',
    });
    expect(describeNotification(item({ customer_name: null }), TZ).title).toBe('New booking: A customer');
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-11-14T15:00:00Z');
    expect(timeAgo('2026-11-14T14:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-14T14:55:00Z', now)).toBe('5m');
    expect(timeAgo('2026-11-14T12:00:00Z', now)).toBe('3h');
    expect(timeAgo('2026-11-12T15:00:00Z', now)).toBe('2d');
  });
});

describe('describeJobEvent', () => {
  const options = { timeZone: TZ, currency: 'usd', team: [{ id: 'm1', name: 'Carl Crew' }] };
  it('reads the timeline', () => {
    expect(describeJobEvent({ event_type: 'created', from_status: null, to_status: 'confirmed', data: { source: 'booking_page' } }, options).title).toBe('Booked online');
    expect(describeJobEvent({ event_type: 'status_changed', from_status: 'pending_payment', to_status: 'confirmed', data: {} }, options)).toEqual({
      title: 'Deposit paid',
      detail: 'Booking confirmed',
    });
    expect(describeJobEvent({ event_type: 'status_changed', from_status: 'confirmed', to_status: 'completed', data: {} }, options).title).toBe('Completed');
    expect(describeJobEvent({ event_type: 'reassigned', from_status: null, to_status: null, data: { to_member_id: 'm1' } }, options).detail).toBe('To Carl Crew');
    expect(describeJobEvent({ event_type: 'payment', from_status: null, to_status: null, data: { kind: 'balance', amount_cents: 4500 } }, options)).toEqual({
      title: 'Balance payment received',
      detail: '$45',
    });
  });
});

describe('signInMessage', () => {
  it('explains sign-in problems without revealing which part was wrong', () => {
    expect(signInMessage({ message: 'x', code: 'invalid_credentials' })).toMatch(/don't match/);
    expect(signInMessage({ message: 'x', code: 'email_not_confirmed' })).toMatch(/Confirm your email/);
    expect(signInMessage({ message: 'x', status: 429 })).toMatch(/Too many attempts/);
    expect(signInMessage({ message: 'Network request failed' })).toMatch(/Can't reach/);
    expect(signInMessage({ message: 'boom' })).toBe('Something went wrong. Please try again.');
  });
});
