/**
 * The app's data access. Screens only use the hooks at the bottom.
 *
 * Reads, and saving your own details, go straight to Supabase as the signed-in
 * customer (or anonymously):
 *   search_businesses, business_trades, get_booking_page, get_available_slots,
 *   my_bookings, my_booking, my_details, my_reschedule_slots, save_my_details,
 *   finish_my_setup, set_my_avatar (the photo itself goes to the private
 *   avatars bucket, in a folder only they can use).
 * Changes go through the web app's /api/app routes, which add what the
 * database can't do alone (geocoding, emails right away, account deletion).
 */

import { QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import type { ProfilePhoto } from '@/lib/photo';
import { supabase } from '@/lib/supabase';

import { useAuth } from './auth';
import type { BookingPage, BusinessSummary, CustomerBooking, DetailsInput, MyDetails, Slot } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the server over a bad request; do retry flaky networks once.
      retry: (failures, error) => failures < 1 && !(error instanceof ApiError && error.status < 500),
    },
  },
});

/** An error with a message that's fine to show the customer. */
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

async function call<T>(promise: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
  let result;
  try {
    result = await promise;
  } catch {
    throw new ApiError(OFFLINE, 'offline', 0);
  }
  if (result.error) {
    console.warn('[api]', result.error);
    throw new ApiError('Something went wrong. Please try again.', result.error.code ?? 'failed');
  }
  return result.data as T;
}

/** A request to the web app's customer API, signed with the current session. */
async function appApi<T>(path: string, init: { method: 'POST' | 'DELETE'; body?: unknown }): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError('Sign in to continue.', 'unauthenticated', 401);

  let response: Response;
  try {
    response = await fetch(`${config.siteUrl}/api/app${path}`, {
      method: init.method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(OFFLINE, 'offline', 0);
  }
  const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    throw new ApiError(body?.error ?? 'Something went wrong. Please try again.', body?.code ?? 'failed', response.status);
  }
  return body as T;
}

// --- Businesses (anyone) --------------------------------------------------------

const PAGE = 20;

export async function searchBusinesses(query: string, trade: string | null, page: number) {
  return call<BusinessSummary[]>(
    supabase.rpc('search_businesses', { p_query: query.trim() || undefined, p_trade: trade ?? undefined, p_limit: PAGE, p_offset: page * PAGE }),
  );
}

export const getTrades = () => call<{ trade: string; business_count: number }[]>(supabase.rpc('business_trades'));

export const getBookingPage = (slug: string) => call<BookingPage | null>(supabase.rpc('get_booking_page', { p_slug: slug }));

/** Open times for these services, starting at `from` (YYYY-MM-DD, business's local date; null = today). */
export const getAvailableSlots = (slug: string, serviceIds: string[], from: string | null) =>
  call<Slot[]>(
    supabase.rpc('get_available_slots', { p_slug: slug, p_service_ids: serviceIds, p_from: from ?? undefined, p_days: 14 }),
  );

// --- The signed-in customer -------------------------------------------------------

export const getMyBookings = () => call<CustomerBooking[]>(supabase.rpc('my_bookings'));

export const getMyBooking = (id: string) => call<CustomerBooking | null>(supabase.rpc('my_booking', { p_booking_id: id }));

export const getMyDetails = () => call<MyDetails | null>(supabase.rpc('my_details'));

export const getRescheduleSlots = (id: string) =>
  call<Slot[]>(supabase.rpc('my_reschedule_slots', { p_booking_id: id, p_days: 14 }));

const DETAILS_ERRORS: Record<string, string> = {
  invalid_name: 'Enter your name.',
  invalid_phone: 'Enter a valid phone number.',
  invalid_address: 'Enter a street address, or leave it blank.',
};

/** Saves name, phone and (optionally) home address; returns the updated details. */
export async function saveMyDetails({ fullName, phone, address, finishSetup = false }: DetailsInput) {
  let result;
  try {
    result = await supabase.rpc('save_my_details', {
      p_full_name: fullName,
      p_phone: phone,
      p_address: address,
      p_finish_setup: finishSetup,
    });
  } catch {
    throw new ApiError(OFFLINE, 'offline', 0);
  }
  if (result.error) {
    const message = DETAILS_ERRORS[result.error.message];
    if (!message) console.warn('[api]', result.error);
    throw new ApiError(message ?? 'Something went wrong. Please try again.', message ? result.error.message : 'failed', message ? 422 : 500);
  }
  return result.data as unknown as MyDetails;
}

/** "Skip for now": stop offering account setup. */
export const finishMySetup = () => call<null>(supabase.rpc('finish_my_setup'));

// --- Profile photo ---------------------------------------------------------------

const AVATARS = 'avatars';
const PHOTO_FAILED = "We couldn't save your photo. Please try again.";

/** A link to their photo. The bucket is private, so it's signed and expires in an hour. */
export async function getAvatarUrl(path: string) {
  const { data, error } = await supabase.storage.from(AVATARS).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new ApiError("We couldn't load your photo.", 'failed');
  return data.signedUrl;
}

/** Points their profile at `path` (or at nothing), then deletes the photo it replaces. */
async function swapAvatar(path: string | null) {
  const previous = await call<string | null>(supabase.rpc('set_my_avatar', path ? { p_path: path } : {}));
  // Best effort: an old file left behind only costs storage, and goes when the account does.
  if (previous) await supabase.storage.from(AVATARS).remove([previous]);
}

/** Uploads a new profile photo and makes it theirs. */
export async function setMyAvatar(photo: ProfilePhoto) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new ApiError('Sign in to continue.', 'unauthenticated', 401);

  // A fresh name every time, so no device or CDN shows a stale photo.
  const path = `${userId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${photo.extension}`;
  let upload;
  try {
    upload = await supabase.storage.from(AVATARS).upload(path, photo.bytes, { contentType: photo.contentType, upsert: false });
  } catch {
    throw new ApiError(OFFLINE, 'offline', 0);
  }
  if (upload.error) {
    console.warn('[api]', upload.error);
    throw new ApiError(PHOTO_FAILED);
  }
  try {
    await swapAvatar(path);
  } catch (error) {
    await supabase.storage.from(AVATARS).remove([path]);
    throw error instanceof ApiError && error.code === 'offline' ? error : new ApiError(PHOTO_FAILED);
  }
}

export const removeMyAvatar = () => swapAvatar(null);

export type NewBooking = {
  slug: string;
  serviceIds: string[];
  start: string;
  customer: { fullName: string; phone: string };
  address: { line1: string; line2: string; city: string; region: string; postalCode: string };
  notes: string;
};

export const createBooking = (booking: NewBooking) =>
  appApi<{ booking: CustomerBooking; manageUrl: string }>('/bookings', { method: 'POST', body: booking });

export const rescheduleBooking = (id: string, start: string) =>
  appApi<{ booking: CustomerBooking }>(`/bookings/${id}/reschedule`, { method: 'POST', body: { start } });

export const cancelBooking = (id: string, reason: string) =>
  appApi<{ outcome: 'cancelled' | 'requested'; booking: CustomerBooking }>(`/bookings/${id}/cancel`, {
    method: 'POST',
    body: { reason },
  });

export const deleteAccount = () => appApi<{ deleted: true }>('/account', { method: 'DELETE' });

// --- Status helpers --------------------------------------------------------------

const ACTIVE = ['pending_payment', 'requested', 'confirmed', 'in_progress'];

export function isUpcoming(booking: CustomerBooking) {
  return ACTIVE.includes(booking.status) && new Date(booking.scheduled_end).getTime() > Date.now();
}

// --- Hooks -------------------------------------------------------------------------
// Everything personal lives under the ['me'] key, which is dropped on sign-out.

export function useBusinessSearch(query: string, trade: string | null) {
  return useInfiniteQuery({
    queryKey: ['businesses', query.trim().toLowerCase(), trade],
    queryFn: ({ pageParam }) => searchBusinesses(query, trade, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE && pages.length * PAGE < Number(last[0]?.total_count ?? 0) ? pages.length : undefined),
  });
}

export const useTrades = () => useQuery({ queryKey: ['trades'], queryFn: getTrades, staleTime: 5 * 60_000 });

export const useBookingPage = (slug: string) => useQuery({ queryKey: ['booking-page', slug], queryFn: () => getBookingPage(slug) });

export const useAvailableSlots = (slug: string, serviceIds: string[], from: string | null) =>
  useQuery({
    queryKey: ['slots', slug, [...serviceIds].sort((a, b) => a.localeCompare(b)), from],
    queryFn: () => getAvailableSlots(slug, serviceIds, from),
    enabled: serviceIds.length > 0,
    staleTime: 15_000,
  });

export function useMyBookings() {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: ['me', 'bookings'], queryFn: getMyBookings, enabled: signedIn });
}

export function useMyBooking(id: string) {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: ['me', 'bookings', id], queryFn: () => getMyBooking(id), enabled: signedIn });
}

export function useMyDetails() {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: ['me', 'details'], queryFn: getMyDetails, enabled: signedIn });
}

/** A displayable URL for their photo; refreshed before the signed link expires. */
export const useAvatarUrl = (path: string | null | undefined) =>
  useQuery({
    queryKey: ['me', 'avatar', path],
    queryFn: () => getAvatarUrl(path!),
    enabled: Boolean(path),
    staleTime: 45 * 60_000,
    gcTime: 50 * 60_000,
  });

function useAvatarMutation<T>(mutationFn: (input: T) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => client.invalidateQueries({ queryKey: ['me', 'details'] }) });
}

export const useSetMyAvatar = () => useAvatarMutation(setMyAvatar);
export const useRemoveMyAvatar = () => useAvatarMutation(removeMyAvatar);

export const useRescheduleSlots = (id: string) =>
  useQuery({ queryKey: ['me', 'reschedule-slots', id], queryFn: () => getRescheduleSlots(id), staleTime: 15_000 });

/** After any change to a booking, refresh everything that shows bookings. */
function useRefreshBookings() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['me'] });
    client.invalidateQueries({ queryKey: ['slots'] });
  };
}

export function useCreateBooking() {
  const refresh = useRefreshBookings();
  return useMutation({ mutationFn: createBooking, onSuccess: refresh });
}

export function useRescheduleBooking() {
  const refresh = useRefreshBookings();
  return useMutation({ mutationFn: ({ id, start }: { id: string; start: string }) => rescheduleBooking(id, start), onSuccess: refresh });
}

export function useCancelBooking() {
  const refresh = useRefreshBookings();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelBooking(id, reason), onSuccess: refresh });
}

export function useSaveMyDetails() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveMyDetails,
    onSuccess: (details) => {
      client.setQueryData(['me', 'details'], details);
      client.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useFinishMySetup() {
  const client = useQueryClient();
  return useMutation({ mutationFn: finishMySetup, onSuccess: () => client.invalidateQueries({ queryKey: ['me', 'details'] }) });
}

export const useDeleteAccount = () => useMutation({ mutationFn: deleteAccount });
