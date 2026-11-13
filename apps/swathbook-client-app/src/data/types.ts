/**
 * Data shapes the app works with. Table and function row types come from the
 * generated database.types.ts (`pnpm db:types` at the repo root); the JSON
 * that functions build (get_booking_page, my_bookings, my_details) is typed
 * here to match supabase/migrations.
 */

import type { Database } from './database.types';

type Public = Database['public'];

export type BookingStatus = Public['Enums']['booking_status'];
export type PriceType = Public['Enums']['price_type'];
export type RefundPolicy = Public['Enums']['refund_policy'];

/** A row from search_businesses. */
export type BusinessSummary = Public['Functions']['search_businesses']['Returns'][number];

export type Slot = { slot_start: string; slot_end: string };

// --- get_booking_page --------------------------------------------------------

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  price_type: PriceType;
  price_cents: number;
  duration_minutes: number;
  deposit_cents: number;
};

export type PublicBusiness = {
  id: string;
  name: string;
  slug: string;
  trade: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  service_area: string | null;
  logo_path: string | null;
  cover_path: string | null;
  brand_color: string | null;
  timezone: string;
  currency: string;
  service_radius_miles: number | null;
  cancellation_window_hours: number;
  deposit_refund_policy: RefundPolicy;
  accepts_online_payments: boolean;
};

/** 0 = Sunday, like Postgres extract(dow). Times are 'HH:MM:SS' in the business's time zone. */
export type BusinessHours = { weekday: number; opens_at: string; closes_at: string };

export type BookingPage = {
  business: PublicBusiness;
  services: PublicService[];
  hours: BusinessHours[];
  photos: { id: string; storage_path: string; caption: string | null }[];
};

// --- my_bookings / my_booking -------------------------------------------------

/** What the customer may do right now (customer_booking_options). */
export type BookingOptions = {
  can_reschedule: boolean;
  reschedule_blocked_reason: 'status' | 'cancel_requested' | 'not_offered' | 'limit' | 'too_late' | null;
  can_cancel: boolean;
  /** True when cancelling asks the business; false when it happens right away. */
  cancel_is_request: boolean;
  cancel_requested_at: string | null;
  cancellation_window_hours: number;
  deposit_refund_policy: RefundPolicy;
  reschedules_left: number;
};

export type BookingAddress = {
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
};

/** One of the signed-in customer's bookings, at any business. */
export type CustomerBooking = {
  id: string;
  reference: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  hold_expires_at: string | null;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  deposit_due_cents: number;
  deposit_paid_cents: number;
  amount_paid_cents: number;
  amount_refunded_cents: number;
  balance_due_cents: number;
  customer_notes: string | null;
  cancel_requested_at: string | null;
  cancellation_reason: string | null;
  public_token: string;
  business: {
    id: string;
    name: string;
    slug: string;
    trade: string;
    brand_color: string | null;
    logo_path: string | null;
    phone: string | null;
    email: string | null;
    timezone: string;
    cancellation_window_hours: number;
    deposit_refund_policy: RefundPolicy;
    accepts_online_payments: boolean;
    /** Still taking bookings (published and subscribed), so "Book again" works. */
    is_bookable: boolean;
  };
  items: { name: string; quantity: number; line_total_cents: number; duration_minutes: number | null }[];
  address: BookingAddress | null;
  options: BookingOptions | null;
};

/** my_details: who the customer is, what to prefill bookings with, and setup state. */
export type MyDetails = {
  email: string;
  full_name: string | null;
  phone: string | null;
  /** Their profile photo in the private avatars bucket (show it with useAvatarUrl). */
  avatar_path: string | null;
  /** Best address for a new booking: their saved home, else where they last booked. */
  address: BookingAddress | null;
  /** The home address they saved themselves (null if none). */
  home_address: BookingAddress | null;
  /** When they finished (or skipped) setup in the app; null means show setup. */
  onboarded_at: string | null;
  /** Bookings already made with this email, at any business. */
  booking_count: number;
};

export type DetailsInput = {
  fullName: string;
  phone: string;
  /** Omit to leave the saved address alone; an empty line1 clears it. */
  address?: { line1: string; line2: string; city: string; region: string; postal_code: string };
  finishSetup?: boolean;
};
