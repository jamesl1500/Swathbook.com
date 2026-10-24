/**
 * Service-role access to the local Supabase stack for arranging test state.
 * Bypasses RLS, so it's for setup and assertions only, never for the code under test.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/libs/supabase/database.types";
import { PASSWORD, uniqueEmail, uniqueSlug } from "./data";
import { env } from "./env";

export const admin = createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = { id: string; email: string; password: string; fullName: string };

export async function createUser({
    fullName = "Dana Field",
    confirmed = true,
    desiredSlug,
}: { fullName?: string; confirmed?: boolean; desiredSlug?: string } = {}): Promise<TestUser> {
    const email = uniqueEmail();
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: confirmed,
        user_metadata: { full_name: fullName, ...(desiredSlug ? { desired_slug: desiredSlug } : {}) },
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    return { id: data.user.id, email, password: PASSWORD, fullName };
}

export async function createBusiness(
    ownerId: string,
    {
        name = "Green Acres",
        slug = uniqueSlug("green-acres"),
        live = true,
        openEveryDay = false,
        services = [{ name: "Weekly mow", price_cents: 4500, duration_minutes: 60 }],
        published = live,
    }: {
        name?: string;
        slug?: string;
        live?: boolean;
        /** Bookable 6 AM – 9 PM every day with no minimum notice, so slots always exist. */
        openEveryDay?: boolean;
        services?: Array<{ name: string; price_cents: number; duration_minutes: number }>;
        published?: boolean;
    } = {},
) {
    const { data: business, error } = await admin
        .from("businesses")
        .insert({
            owner_id: ownerId,
            name,
            slug,
            trade: "lawn-care",
            timezone: "America/Chicago",
            base_address: "1 Main St, Austin",
            base_lat: 30.2672,
            base_lng: -97.7431,
            service_radius_miles: 50,
            booking_lead_time_minutes: openEveryDay ? 0 : 120,
            buffer_minutes: openEveryDay ? 0 : 15,
            is_published: published,
            onboarding_completed_at: live ? new Date().toISOString() : null,
        })
        .select("id, name, slug")
        .single();
    if (error || !business) throw error ?? new Error("createBusiness failed");

    if (live) {
        if (services.length) {
            await admin.from("services").insert(services.map((service, index) => ({ ...service, business_id: business.id, sort_order: index })));
        }
        const days = openEveryDay ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
        await admin.from("business_hours").insert(
            days.map((weekday) => ({
                business_id: business.id,
                weekday,
                opens_at: openEveryDay ? "06:00" : "08:00",
                closes_at: openEveryDay ? "21:00" : "17:00",
            })),
        );
    }
    return business;
}

export async function memberIdFor(businessId: string, userId: string) {
    const { data } = await admin.from("business_members").select("id").eq("business_id", businessId).eq("user_id", userId).single();
    return data!.id;
}

export async function addCrewMember(businessId: string, fullName = "Carl Crew") {
    const user = await createUser({ fullName });
    const { data } = await admin
        .from("business_members")
        .insert({ business_id: businessId, user_id: user.id, role: "crew", display_name: fullName })
        .select("id")
        .single();
    return { ...user, memberId: data!.id };
}

/** A confirmed job with a mappable address, assigned to `memberId`. */
export async function addJob(
    businessId: string,
    { start, memberId, customerName, lat, lng, minutes = 60 }: { start: Date; memberId: string | null; customerName: string; lat: number; lng: number; minutes?: number },
) {
    const { data: customer } = await admin
        .from("customers")
        .insert({ business_id: businessId, full_name: customerName, email: uniqueEmail("customer") })
        .select("id")
        .single();
    const { data: address } = await admin
        .from("customer_addresses")
        .insert({ business_id: businessId, customer_id: customer!.id, line1: `${customerName} St`, city: "Austin", region: "TX", lat, lng, is_primary: true })
        .select("id")
        .single();
    const { data: booking, error } = await admin
        .from("bookings")
        .insert({
            business_id: businessId,
            customer_id: customer!.id,
            address_id: address!.id,
            assigned_member_id: memberId,
            status: "confirmed",
            scheduled_start: start.toISOString(),
            scheduled_end: new Date(start.getTime() + minutes * 60_000).toISOString(),
        })
        .select("id")
        .single();
    if (error) throw error;
    await admin.from("booking_items").insert({ business_id: businessId, booking_id: booking!.id, name: "Weekly mow", unit_price_cents: 4500, duration_minutes: minutes });
    return { bookingId: booking!.id, customerId: customer!.id };
}

export async function getBusinessBySlug(slug: string) {
    const { data } = await admin
        .from("businesses")
        .select("id, name, owner_id, is_published, onboarding_completed_at, services(name, price_cents, deposit_type), business_hours(weekday)")
        .eq("slug", slug)
        .maybeSingle();
    return data;
}
