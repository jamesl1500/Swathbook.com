/**
 * The app's data. Screens use the hooks at the bottom (TanStack Query).
 *
 * Everything goes to Supabase as the signed-in team member, so Row Level
 * Security and the database functions apply exactly as on the web dashboard:
 *   booking_counts, booking_list, update_job_status, my_notifications,
 *   mark_notifications_read, and plain reads of bookings and the team.
 * Answering a cancellation request goes through the web app
 * (POST /api/owner/bookings/:id/cancel-request), since it can refund through Stripe.
 *
 * Every business's data is cached under ['business', id], so switching
 * business never mixes them, and signing out clears it all.
 */

import { focusManager, keepPreviousData, QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { bookingListArgs, PAGE_SIZE, type BookingView } from '@/lib/booking-views';
import { config } from '@/lib/config';
import type { NotificationFeed } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { dayRange } from '@/lib/time';

import type { Database } from './database.types';

type Public = Database['public'];
export type BookingStatus = Public['Enums']['booking_status'];
export type MemberRole = Public['Enums']['member_role'];
export type BookingRow = Public['Functions']['booking_list']['Returns'][number];
export type BookingCounts = { upcoming?: number; requests?: number; cancel_requests?: number; awaiting_deposit?: number; today?: number };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry flaky networks once; never hammer the server over a bad request.
      retry: (failures, error) => failures < 1 && !(error instanceof ApiError && error.status < 500),
    },
  },
});

// Coming back to the app counts as focus: stale screens refresh then, not on a timer.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

/** An error with a message that's fine to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string = 'failed',
    readonly status: number = 500,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const OFFLINE = "Can't reach Swathbook. Check your connection and try again.";
const FAILED = 'Something went wrong. Please try again.';
const REQUEST_TIMEOUT_MS = 20_000;

async function call<T>(promise: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>, messages: Record<string, string> = {}): Promise<T> {
  let result;
  try {
    result = await promise;
  } catch {
    throw new ApiError(OFFLINE, 'offline', 0);
  }
  if (result.error) {
    const known = Object.entries(messages).find(([key]) => result.error!.message.includes(key));
    if (!known) console.warn('[api]', result.error.code ?? result.error.message);
    throw new ApiError(known?.[1] ?? FAILED, known?.[0] ?? result.error.code ?? 'failed', known ? 409 : 500);
  }
  return result.data as T;
}

// --- Businesses ------------------------------------------------------------------

export type Membership = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  role: MemberRole;
  memberId: string;
  depositRefundPolicy: string;
  cancellationWindowHours: number;
};

/** Every live business this login works for, oldest first. */
export async function getMemberships(userId: string): Promise<Membership[]> {
  const rows = await call<
    {
      id: string;
      role: MemberRole;
      business: {
        id: string;
        name: string;
        slug: string;
        timezone: string;
        currency: string;
        onboarding_completed_at: string | null;
        created_at: string;
        deposit_refund_policy: string;
        cancellation_window_hours: number;
      } | null;
    }[]
  >(
    supabase
      .from('business_members')
      .select('id, role, business:businesses!inner(id, name, slug, timezone, currency, onboarding_completed_at, created_at, deposit_refund_policy, cancellation_window_hours)')
      .eq('user_id', userId)
      .eq('status', 'active'),
  );
  return rows
    .filter((row) => row.business?.onboarding_completed_at)
    .sort((a, b) => a.business!.created_at.localeCompare(b.business!.created_at))
    .map((row) => ({
      id: row.business!.id,
      name: row.business!.name,
      slug: row.business!.slug,
      timezone: row.business!.timezone,
      currency: row.business!.currency,
      role: row.role,
      memberId: row.id,
      depositRefundPolicy: row.business!.deposit_refund_policy,
      cancellationWindowHours: row.business!.cancellation_window_hours,
    }));
}

export async function getTeam(businessId: string) {
  return call<{ id: string; display_name: string | null }[]>(
    supabase.from('business_members').select('id, display_name').eq('business_id', businessId).eq('status', 'active'),
  );
}

// --- Bookings --------------------------------------------------------------------

export const getBookingCounts = (businessId: string) => call<BookingCounts>(supabase.rpc('booking_counts', { p_business_id: businessId }));

export const getBookingPage = (args: ReturnType<typeof bookingListArgs>) => call<BookingRow[]>(supabase.rpc('booking_list', args));

const JOB_FIELDS = `id, business_id, reference, status, source, scheduled_start, scheduled_end, hold_expires_at, currency, total_cents,
  deposit_due_cents, deposit_paid_cents, balance_due_cents, customer_notes, internal_notes, cancel_requested_at,
  cancel_request_reason, cancellation_reason, assigned_member_id,
  customers(full_name, email, phone),
  customer_addresses(line1, line2, city, region, postal_code, lat, lng, access_notes),
  booking_items(id, name, quantity, line_total_cents, duration_minutes, sort_order),
  booking_answers(service_name, prompt, answer, sort_order),
  booking_events(id, event_type, from_status, to_status, created_at, data)`;

export async function getJob(businessId: string, id: string) {
  const job = await call<Awaited<ReturnType<typeof selectJob>>['data']>(selectJob(businessId, id));
  if (!job) return null;
  return {
    ...job,
    booking_items: [...job.booking_items].sort((a, b) => a.sort_order - b.sort_order),
    booking_answers: [...job.booking_answers].sort((a, b) => a.sort_order - b.sort_order),
    booking_events: [...job.booking_events].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

function selectJob(businessId: string, id: string) {
  return supabase.from('bookings').select(JOB_FIELDS).eq('id', id).eq('business_id', businessId).maybeSingle();
}

export type Job = NonNullable<Awaited<ReturnType<typeof getJob>>>;

const STATUS_ERRORS = {
  not_allowed: 'You can only update jobs assigned to you.',
  'Invalid booking status change': "That job can't move to that status from where it is now.",
  bookings_no_overlap_per_member: 'That overlaps another job for the same person.',
};

export const setJobStatus = (id: string, status: BookingStatus, reason?: string) =>
  call<null>(supabase.rpc('update_job_status', { p_booking_id: id, p_status: status, p_reason: reason || undefined }), STATUS_ERRORS);

export const saveTeamNotes = (businessId: string, id: string, notes: string) =>
  call<null>(supabase.from('bookings').update({ internal_notes: notes.trim().slice(0, 5000) || null }).eq('id', id).eq('business_id', businessId));

/** Answers a cancellation request on the web app, which can refund through Stripe. */
export async function resolveCancelRequest(id: string, decision: { approve: boolean; refund: boolean; note?: string }) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError('Sign in to continue.', 'unauthenticated', 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.siteUrl}/api/owner/bookings/${encodeURIComponent(id)}/cancel-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(decision),
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted ? new ApiError('Swathbook is taking too long to answer. Please try again.', 'timeout', 0) : new ApiError(OFFLINE, 'offline', 0);
  } finally {
    clearTimeout(timer);
  }
  const body = (await response.json().catch(() => null)) as { message?: string; error?: string; code?: string } | null;
  if (!response.ok) throw new ApiError(body?.error ?? FAILED, body?.code ?? 'failed', response.status);
  return body?.message ?? 'Done.';
}

// --- Notifications ---------------------------------------------------------------

export const getNotifications = (businessId: string) =>
  call<NotificationFeed>(supabase.rpc('my_notifications', { p_business_id: businessId, p_limit: 30 }));

export const markNotificationsRead = (businessId: string) => call<null>(supabase.rpc('mark_notifications_read', { p_business_id: businessId }));

// --- Hooks -----------------------------------------------------------------------

export const businessKey = (businessId: string) => ['business', businessId] as const;

export const useMemberships = (userId: string | undefined) =>
  useQuery({ queryKey: ['me', userId, 'memberships'], queryFn: () => getMemberships(userId!), enabled: Boolean(userId), staleTime: 5 * 60_000 });

export const useTeam = (businessId: string) =>
  useQuery({ queryKey: [...businessKey(businessId), 'team'], queryFn: () => getTeam(businessId), staleTime: 5 * 60_000 });

export const useBookingCounts = (businessId: string) =>
  useQuery({ queryKey: [...businessKey(businessId), 'counts'], queryFn: () => getBookingCounts(businessId) });

/** Today's jobs (the business's today), soonest first. Crew see their own. */
export function useTodayJobs(businessId: string, dateKey: string, timeZone: string, memberId?: string | null) {
  return useQuery({
    queryKey: [...businessKey(businessId), 'day', dateKey, memberId ?? 'all'],
    queryFn: () => {
      const { from, to } = dayRange(dateKey, timeZone);
      return getBookingPage({
        p_business_id: businessId,
        p_statuses: ['requested', 'confirmed', 'in_progress', 'completed', 'no_show'],
        p_from: from,
        p_to: to,
        p_member_id: memberId ?? undefined,
        p_cancel_requests: false,
        p_search: undefined,
        p_newest_first: false,
        p_limit: 50,
        p_offset: 0,
      });
    },
  });
}

export function useBookingList(businessId: string, view: BookingView, search: string, memberId?: string | null) {
  return useInfiniteQuery({
    queryKey: [...businessKey(businessId), 'list', view, search.trim().toLowerCase(), memberId ?? 'all'],
    queryFn: ({ pageParam }) => getBookingPage(bookingListArgs(view, { businessId, search, page: pageParam, memberId })),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE && pages.length * PAGE_SIZE < Number(last[0]?.total_count ?? 0) ? pages.length : undefined),
    // Keep showing the last results while a new search loads.
    placeholderData: keepPreviousData,
  });
}

export const useJob = (businessId: string, id: string) =>
  useQuery({ queryKey: [...businessKey(businessId), 'job', id], queryFn: () => getJob(businessId, id) });

export const useNotifications = (businessId: string) =>
  useQuery({ queryKey: [...businessKey(businessId), 'notifications'], queryFn: () => getNotifications(businessId), refetchInterval: 60_000 });

/** After any change, refresh everything for that business (lists, counts, the job, the feed). */
function useRefreshBusiness(businessId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: businessKey(businessId) });
}

export function useSetJobStatus(businessId: string) {
  const refresh = useRefreshBusiness(businessId);
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: BookingStatus; reason?: string }) => setJobStatus(id, status, reason),
    onSettled: refresh,
  });
}

export function useResolveCancelRequest(businessId: string) {
  const refresh = useRefreshBusiness(businessId);
  return useMutation({
    mutationFn: ({ id, ...decision }: { id: string; approve: boolean; refund: boolean; note?: string }) => resolveCancelRequest(id, decision),
    onSettled: refresh,
  });
}

export function useSaveTeamNotes(businessId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => saveTeamNotes(businessId, id, notes),
    onSuccess: (_data, { id }) => client.invalidateQueries({ queryKey: [...businessKey(businessId), 'job', id] }),
  });
}

export function useMarkNotificationsRead(businessId: string) {
  const client = useQueryClient();
  const key = [...businessKey(businessId), 'notifications'];
  return useMutation({
    mutationFn: () => markNotificationsRead(businessId),
    // The badge clears straight away; items keep their "new" dot until the next load.
    onMutate: () => client.setQueryData<NotificationFeed>(key, (feed) => (feed ? { ...feed, unread: 0 } : feed)),
  });
}
