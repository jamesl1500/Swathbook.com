/**
 * What can be done with a job, by whom, and when. Mirrors the web dashboard
 * (JobActionBar and the bookings list's row actions); the database enforces
 * the same rules again in update_job_status and resolve_cancel_request.
 */

import type { BookingStatus } from '@swathbook/mobile/status';

export type StepKey = 'accept' | 'confirm' | 'start' | 'complete' | 'noshow' | 'decline' | 'cancel';

export type Step = {
  key: StepKey;
  label: string;
  /** The status this moves the job to. */
  status: BookingStatus;
  /** Ask before doing it. */
  confirm?: string;
  /** Ask for an optional reason first (cancelling). */
  askReason?: boolean;
  /** Fixed reason saved with it (declining a request). */
  reason?: string;
  /** Destructive: shown last, in red. */
  danger?: boolean;
};

export type Who = {
  /** Owner or admin. */
  canManage: boolean;
  /** Assigned to them, or they manage the business. */
  canWork: boolean;
};

export const ACTIVE_STATUSES: BookingStatus[] = ['pending_payment', 'requested', 'confirmed', 'in_progress'];

/**
 * The obvious next steps (buttons) and the rest (a "More actions" list), for
 * someone looking at this job right now. `started` means the job's day has
 * come; a cancellation being decided holds off working the job.
 */
export function jobSteps(
  job: { status: BookingStatus; customerName: string; started: boolean; cancelRequested: boolean },
  { canManage, canWork }: Who,
): { primary: Step[]; more: Step[] } {
  const { status, customerName, started, cancelRequested } = job;
  const primary: Step[] = [];
  const more: Step[] = [];

  if (canManage && status === 'requested') primary.push({ key: 'accept', label: 'Accept request', status: 'confirmed' });
  if (canManage && status === 'pending_payment') {
    more.push({ key: 'confirm', label: 'Confirm without deposit', status: 'confirmed', confirm: `Confirm ${customerName}'s booking without the deposit?` });
  }
  if (canWork && !cancelRequested) {
    if (status === 'confirmed') {
      (started ? primary : more).push({ key: 'start', label: 'Start job', status: 'in_progress' });
      more.push({ key: 'complete', label: 'Mark complete', status: 'completed' });
      if (started) more.push({ key: 'noshow', label: 'Mark as no-show', status: 'no_show', confirm: `Mark ${customerName} as a no-show?` });
    }
    if (status === 'in_progress') primary.push({ key: 'complete', label: 'Mark complete', status: 'completed' });
  }
  if (canManage && status === 'requested') {
    more.push({
      key: 'decline',
      label: 'Decline request',
      status: 'cancelled',
      reason: "The business couldn't take this booking",
      confirm: `Decline ${customerName}'s request? They'll get an email.`,
      danger: true,
    });
  } else if (canManage && ACTIVE_STATUSES.includes(status)) {
    more.push({ key: 'cancel', label: 'Cancel job', status: 'cancelled', askReason: true, danger: true });
  }

  return { primary, more };
}

/** Whether approving a cancellation should refund by default, from the business's policy (same rule as the web). */
export function refundByDefault(policy: string, requestedAt: string | null, start: string, windowHours: number) {
  if (policy === 'refundable') return true;
  if (policy === 'refundable_before_window' && requestedAt) {
    return Date.parse(start) - Date.parse(requestedAt) >= windowHours * 3_600_000;
  }
  return false;
}
