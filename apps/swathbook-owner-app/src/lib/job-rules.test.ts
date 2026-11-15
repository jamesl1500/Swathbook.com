import { describe, expect, it } from 'vitest';

import { jobSteps, refundByDefault } from './job-rules';

const owner = { canManage: true, canWork: true };
const crewOnTheJob = { canManage: false, canWork: true };
const crewElsewhere = { canManage: false, canWork: false };

function keys(job: Partial<Parameters<typeof jobSteps>[0]>, who = owner) {
  const { primary, more } = jobSteps({ status: 'confirmed', customerName: 'Pat', started: false, cancelRequested: false, ...job }, who);
  return { primary: primary.map((step) => step.key), more: more.map((step) => step.key) };
}

describe('jobSteps', () => {
  it('asks owners to accept a request, with declining set apart', () => {
    expect(keys({ status: 'requested' })).toEqual({ primary: ['accept'], more: ['decline'] });
  });

  it('offers starting a job on its day, and finishing it once started', () => {
    expect(keys({ started: true })).toEqual({ primary: ['start'], more: ['complete', 'noshow', 'cancel'] });
    expect(keys({ status: 'in_progress', started: true })).toEqual({ primary: ['complete'], more: ['cancel'] });
  });

  it('keeps a future job quiet: everything is in the menu', () => {
    expect(keys({ started: false })).toEqual({ primary: [], more: ['start', 'complete', 'cancel'] });
  });

  it('lets owners confirm without the deposit', () => {
    expect(keys({ status: 'pending_payment' })).toEqual({ primary: [], more: ['confirm', 'cancel'] });
  });

  it('puts destructive steps last, asking first', () => {
    const { more } = jobSteps({ status: 'confirmed', customerName: 'Pat', started: true, cancelRequested: false }, owner);
    expect(more.at(-1)).toMatchObject({ key: 'cancel', danger: true, askReason: true, status: 'cancelled' });
    expect(more.find((step) => step.key === 'noshow')?.confirm).toBe('Mark Pat as a no-show?');
  });

  it('lets crew work their own jobs, but never cancel, confirm or decide requests', () => {
    expect(keys({ started: true }, crewOnTheJob)).toEqual({ primary: ['start'], more: ['complete', 'noshow'] });
    expect(keys({ status: 'requested' }, crewOnTheJob)).toEqual({ primary: [], more: [] });
    expect(keys({ status: 'pending_payment' }, crewOnTheJob)).toEqual({ primary: [], more: [] });
    expect(keys({ started: true }, crewElsewhere)).toEqual({ primary: [], more: [] });
  });

  it('holds off on working a job while its cancellation is being decided', () => {
    expect(keys({ started: true, cancelRequested: true })).toEqual({ primary: [], more: ['cancel'] });
  });

  it('offers nothing on finished jobs', () => {
    for (const status of ['completed', 'cancelled', 'no_show'] as const) expect(keys({ status, started: true })).toEqual({ primary: [], more: [] });
  });
});

describe('refundByDefault', () => {
  const start = '2026-11-20T15:00:00Z';
  it('follows the business policy', () => {
    expect(refundByDefault('refundable', null, start, 24)).toBe(true);
    expect(refundByDefault('non_refundable', '2026-11-01T00:00:00Z', start, 24)).toBe(false);
    expect(refundByDefault('refundable_before_window', '2026-11-18T15:00:00Z', start, 24)).toBe(true);
    expect(refundByDefault('refundable_before_window', '2026-11-20T10:00:00Z', start, 24)).toBe(false);
    expect(refundByDefault('refundable_before_window', null, start, 24)).toBe(false);
  });
});
