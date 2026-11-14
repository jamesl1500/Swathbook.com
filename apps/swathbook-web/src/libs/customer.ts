/**
 * customer.ts
 *
 * Data Access Layer for signed-in customers (the /my pages). A customer is an
 * ordinary Supabase Auth user who signed in with an emailed code. Their jobs
 * are the bookings, at any business, made with their confirmed login email.
 *
 * Every read runs as that user through the my_* database functions, which do
 * the ownership check themselves, so nothing here can leak someone else's
 * booking even if a caller passes the wrong id.
 *
 * @module src/libs/customer
 * @since 1.0.0
 */

import { redirect } from "next/navigation";
import { cache } from "react";
import { routes } from "./routes";
import type { Database } from "./supabase/database.types";
import { createClient } from "./supabase/server";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type CustomerJob = {
    id: string;
    reference: string;
    status: BookingStatus;
    scheduled_start: string;
    scheduled_end: string;
    hold_expires_at: string | null;
    currency: string;
    total_cents: number;
    deposit_due_cents: number;
    deposit_paid_cents: number;
    balance_due_cents: number;
    cancel_requested_at: string | null;
    /** The customer's own key to the booking (payments, calendar, self-service). */
    public_token: string;
    business: {
        id: string;
        name: string;
        slug: string;
        trade: string;
        brand_color: string | null;
        logo_path: string | null;
        phone: string | null;
        timezone: string;
        is_bookable: boolean;
    };
    items: Array<{ name: string; quantity: number; line_total_cents: number }>;
};

export type CustomerAddress = {
    line1: string;
    line2: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
};

export type CustomerDetails = {
    email: string;
    full_name: string | null;
    phone: string | null;
    home_address: CustomerAddress | null;
    booking_count: number;
};

export type SignedInCustomer = { id: string; email: string };

/** The signed-in user (claims verified, not just read from the cookie), or null. */
export const getCustomer = cache(async (): Promise<SignedInCustomer | null> => {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});

/** Like getCustomer(), but sends signed-out visitors to the customer sign-in. */
export async function requireCustomer(nextPath: string): Promise<SignedInCustomer> {
    const customer = await getCustomer();
    if (!customer) redirect(`${routes.customerSignIn}?next=${encodeURIComponent(nextPath)}`);
    return customer;
}

const ACTIVE: BookingStatus[] = ["pending_payment", "requested", "confirmed", "in_progress"];

/** Still to come: booked (or awaiting a deposit or an answer) and not over yet. */
export function isUpcomingJob(job: Pick<CustomerJob, "status" | "scheduled_end">, now = Date.now()) {
    return ACTIVE.includes(job.status) && Date.parse(job.scheduled_end) > now;
}

/** Upcoming soonest first; past most recent first. */
export function splitJobs(jobs: CustomerJob[], now = Date.now()) {
    const upcoming: CustomerJob[] = [];
    const past: CustomerJob[] = [];
    for (const job of jobs) (isUpcomingJob(job, now) ? upcoming : past).push(job);
    upcoming.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
    past.sort((a, b) => b.scheduled_start.localeCompare(a.scheduled_start));
    return { upcoming, past };
}

/** Every job made with the customer's confirmed email (the 200 most recent). Throws on failure. */
export const loadMyJobs = cache(async (): Promise<CustomerJob[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_bookings");
    if (error) throw new Error(`my_bookings failed: ${error.message}`);
    return (data as CustomerJob[] | null) ?? [];
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of the customer's jobs, or null when it doesn't exist or isn't theirs. */
export const loadMyJob = cache(async (id: string): Promise<CustomerJob | null> => {
    if (!UUID.test(id)) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_booking", { p_booking_id: id });
    if (error) throw new Error(`my_booking failed: ${error.message}`);
    return (data as CustomerJob | null) ?? null;
});

/** Name, phone, home address and booking count. Null until the email is confirmed. */
export const loadMyDetails = cache(async (): Promise<CustomerDetails | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_details");
    if (error) throw new Error(`my_details failed: ${error.message}`);
    return (data as CustomerDetails | null) ?? null;
});
