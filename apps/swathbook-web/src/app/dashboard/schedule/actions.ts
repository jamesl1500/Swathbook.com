"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readAddress, withCoordinates } from "@/libs/address";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { checkbox, invalid, text, type FormState } from "@/libs/forms";
import { bookingPath } from "@/libs/routes";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";
import { createClient } from "@/libs/supabase/server";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { isDateKey, zonedToUtc } from "@/libs/time";

const timeKey = z.string().regex(/^\d{2}:\d{2}$/, { error: "Pick a time." });

function overlapMessage(error: { code?: string; message: string } | null) {
    return error?.code === "23P01" || error?.message.includes("bookings_no_overlap_per_member")
        ? "That overlaps another job for the same person. Pick another time or assign someone else."
        : null;
}

// ---------------------------------------------------------------------------
// Job status, schedule and assignment
// ---------------------------------------------------------------------------

const STATUSES = ["requested", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;

export async function updateJobStatus(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    const status = z.enum(STATUSES).safeParse(text(formData, "status"));
    if (!status.success) return { error: "Pick a valid status." };

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_job_status", {
        p_booking_id: text(formData, "bookingId"),
        p_status: status.data,
        p_reason: text(formData, "reason") || undefined,
    });
    if (error) {
        if (error.message.includes("not_allowed")) return { error: "You can only update jobs assigned to you." };
        if (error.message.includes("Invalid booking status change")) return { error: "That job can't move to that status from where it is now." };
        return { error: "We couldn't update the job." };
    }
    sendQueuedEmailsSoon(text(formData, "bookingId"));
    refresh();
    return { success: "Job updated." };
}

export async function rescheduleBooking(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const parsed = z
        .object({ date: z.string().refine(isDateKey, { error: "Pick a date." }), time: timeKey, durationMinutes: z.coerce.number().int().min(5).max(1440) })
        .safeParse({ date: text(formData, "date"), time: text(formData, "time"), durationMinutes: text(formData, "durationMinutes") });
    if (!parsed.success) return invalid(parsed.error);

    const start = zonedToUtc(parsed.data.date, parsed.data.time, await businessTimezone(auth.businessId));
    const end = new Date(start.getTime() + parsed.data.durationMinutes * 60_000);

    const supabase = await createClient();
    const { error } = await supabase
        .from("bookings")
        .update({ scheduled_start: start.toISOString(), scheduled_end: end.toISOString() })
        .eq("id", text(formData, "bookingId"))
        .eq("business_id", auth.businessId);
    if (error) return { error: overlapMessage(error) ?? "We couldn't reschedule this job." };
    sendQueuedEmailsSoon(text(formData, "bookingId"));
    refresh();
    return { success: "Rescheduled." };
}

export async function assignBooking(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const memberId = text(formData, "memberId");
    const supabase = await createClient();
    const { error } = await supabase
        .from("bookings")
        .update({ assigned_member_id: memberId || null })
        .eq("id", text(formData, "bookingId"))
        .eq("business_id", auth.businessId);
    if (error) return { error: overlapMessage(error) ?? "We couldn't reassign this job." };
    refresh();
    return { success: memberId ? "Job reassigned." : "Job unassigned." };
}

export async function saveJobNotes(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const supabase = await createClient();
    const { error } = await supabase
        .from("bookings")
        .update({ internal_notes: text(formData, "internalNotes").slice(0, 5000) || null })
        .eq("id", text(formData, "bookingId"))
        .eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't save the notes." };
    refresh();
    return { success: "Notes saved." };
}

/** Starts a refund on Stripe; the webhook records the result. */
/** Refunds whatever is left on one payment. Shared by the refund button and approved cancellations. */
async function refundRemaining(auth: { businessId: string; user: { id: string } }, paymentId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data: payment } = await supabase
        .from("payments")
        .select("id, business_id, amount_cents, amount_refunded_cents, stripe_payment_intent_id, stripe_account_id, status")
        .eq("id", paymentId)
        .eq("business_id", auth.businessId)
        .maybeSingle();
    if (!payment?.stripe_payment_intent_id || !["succeeded", "partially_refunded"].includes(payment.status)) {
        return "That payment can't be refunded.";
    }
    const remaining = payment.amount_cents - payment.amount_refunded_cents;
    if (remaining <= 0) return "That payment is already fully refunded.";

    try {
        const refund = await getStripe().refunds.create(
            { payment_intent: payment.stripe_payment_intent_id, amount: remaining, reason: "requested_by_customer", metadata: { refunded_by: auth.user.id } },
            { stripeAccount: payment.stripe_account_id, idempotencyKey: `refund:${payment.id}:${remaining}` },
        );
        await createAdminClient()
            .from("refunds")
            .upsert(
                {
                    business_id: auth.businessId,
                    payment_id: payment.id,
                    amount_cents: refund.amount,
                    status: refund.status === "succeeded" ? "succeeded" : "pending",
                    reason: "requested_by_customer",
                    stripe_refund_id: refund.id,
                    created_by: auth.user.id,
                },
                { onConflict: "stripe_refund_id" },
            );
    } catch (error) {
        console.error("[schedule] refund failed", error);
        return "Stripe couldn't refund that payment.";
    }
    return null;
}

export async function refundPayment(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    if (!hasStripe()) return { error: "Payments aren't configured on this server." };

    const error = await refundRemaining(auth, text(formData, "paymentId"));
    if (error) return { error };
    refresh();
    return { success: "Refund started. It shows on the customer's card in 5–10 days." };
}

/** Approves (optionally refunding what was paid) or declines a customer's cancellation request. */
export async function resolveCancellation(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const bookingId = text(formData, "bookingId");
    const approve = formData.get("approve") === "1";
    const refund = checkbox(formData, "refund");

    const supabase = await createClient();
    const { error } = await supabase.rpc("resolve_cancel_request", {
        p_booking_id: bookingId,
        p_approve: approve,
        p_note: text(formData, "note") || undefined,
    });
    if (error) {
        return { error: error.message.includes("no_cancel_request") ? "That request was already answered." : "We couldn't update the booking." };
    }

    let refundNote = "";
    if (approve && refund && hasStripe()) {
        const { data: payments } = await supabase
            .from("payments")
            .select("id")
            .eq("booking_id", bookingId)
            .eq("business_id", auth.businessId)
            .in("status", ["succeeded", "partially_refunded"]);
        const failures = (await Promise.all((payments ?? []).map((payment) => refundRemaining(auth, payment.id)))).filter(Boolean);
        refundNote = payments?.length ? (failures.length ? " The refund didn't go through; try it from Payments." : " Refund started.") : "";
    }

    sendQueuedEmailsSoon(bookingId);
    refresh();
    return { success: approve ? `Booking cancelled. The customer has been emailed.${refundNote}` : "Request declined. The booking stays on and the customer has been emailed." };
}

async function businessTimezone(businessId: string) {
    const supabase = await createClient();
    const { data } = await supabase.from("businesses").select("timezone").eq("id", businessId).single();
    return data?.timezone ?? "UTC";
}

// ---------------------------------------------------------------------------
// Manual bookings
// ---------------------------------------------------------------------------

export type CustomerOption = {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    addresses: Array<{ id: string; line1: string; city: string | null; isPrimary: boolean }>;
};

export async function searchCustomers(businessId: string, query: string): Promise<CustomerOption[]> {
    const auth = await authorizeBusiness(businessId, { manage: true });
    if (isFailure(auth)) return [];
    const supabase = await createClient();
    const term = query.trim().toLowerCase().slice(0, 100);
    let request = supabase
        .from("customers")
        .select("id, full_name, email, phone, customer_addresses(id, line1, city, is_primary)")
        .eq("business_id", auth.businessId)
        .order("full_name")
        .limit(8);
    if (term) request = request.like("search_text", `%${term.replace(/[%_]/g, "")}%`);
    const { data } = await request;
    return (data ?? []).map((customer) => ({
        id: customer.id,
        fullName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        addresses: customer.customer_addresses.map((address) => ({ id: address.id, line1: address.line1, city: address.city, isPrimary: address.is_primary })),
    }));
}

const manualBookingSchema = z.object({
    serviceIds: z.array(z.uuid()).min(1, { error: "Pick at least one service." }).max(10),
    date: z.string().refine(isDateKey, { error: "Pick a date." }),
    time: timeKey,
    memberId: z.union([z.literal(""), z.uuid()]),
    status: z.enum(["confirmed", "requested"]),
    customerNotes: z.string().max(2000),
    internalNotes: z.string().max(5000),
});

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** The picked customer, or a new one created from the inline fields. */
async function resolveCustomer(supabase: ServerClient, businessId: string, formData: FormData): Promise<{ id: string } | FormState> {
    const existing = text(formData, "customerId");
    if (existing) return { id: existing };

    const fullName = text(formData, "newCustomerName");
    if (!fullName) return { fieldErrors: { customer: ["Pick a customer or enter a new one."] } };
    const email = text(formData, "newCustomerEmail").toLowerCase();
    const { data: created, error } = await supabase
        .from("customers")
        .insert({ business_id: businessId, full_name: fullName.slice(0, 120), email: email || null, phone: text(formData, "newCustomerPhone") || null })
        .select("id")
        .single();
    if (created) return { id: created.id };
    const message = error?.code === "23505" ? "A customer with that email already exists. Search for them instead." : "We couldn't add that customer.";
    return { fieldErrors: { customer: [message] } };
}

/** An existing address id, a newly saved address, or none. */
async function resolveAddressId(
    supabase: ServerClient,
    businessId: string,
    customerId: string,
    formData: FormData,
): Promise<{ id: string | null } | FormState> {
    const choice = text(formData, "addressId");
    if (choice !== "new") return { id: choice || null };

    const address = readAddress(formData);
    if (!address.success) return invalid(address.error);
    const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
    const { data: created } = await supabase
        .from("customer_addresses")
        .insert({ ...(await withCoordinates(address.data)), business_id: businessId, customer_id: customerId, is_primary: !count })
        .select("id")
        .single();
    return created ? { id: created.id } : { error: "We couldn't save that address." };
}

export async function createManualBooking(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const parsed = manualBookingSchema.safeParse({
        serviceIds: formData.getAll("serviceIds").filter((value): value is string => typeof value === "string"),
        date: text(formData, "date"),
        time: text(formData, "time"),
        memberId: text(formData, "memberId"),
        status: text(formData, "status") || "confirmed",
        customerNotes: text(formData, "customerNotes"),
        internalNotes: text(formData, "internalNotes"),
    });
    if (!parsed.success) return invalid(parsed.error);
    const values = parsed.data;
    const supabase = await createClient();

    const customer = await resolveCustomer(supabase, auth.businessId, formData);
    if (!("id" in customer)) return customer;
    const address = await resolveAddressId(supabase, auth.businessId, customer.id, formData);
    if (!("id" in address)) return address;

    const { data: services } = await supabase
        .from("services")
        .select("id, name, description, price_cents, duration_minutes")
        .eq("business_id", auth.businessId)
        .in("id", values.serviceIds);
    if (services?.length !== values.serviceIds.length) return { error: "One of those services no longer exists." };
    const customerId = customer.id;
    const addressId = address.id;

    const { data: business } = await supabase.from("businesses").select("timezone, currency").eq("id", auth.businessId).single();
    const start = zonedToUtc(values.date, values.time, business?.timezone ?? "UTC");
    const minutes = services.reduce((sum, service) => sum + service.duration_minutes, 0);
    const end = new Date(start.getTime() + minutes * 60_000);

    const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
            business_id: auth.businessId,
            customer_id: customerId,
            address_id: addressId,
            assigned_member_id: values.memberId || null,
            status: values.status,
            source: "manual",
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            currency: business?.currency ?? "usd",
            customer_notes: values.customerNotes || null,
            internal_notes: values.internalNotes || null,
        })
        .select("id")
        .single();
    if (error || !booking) return { error: overlapMessage(error) ?? "We couldn't create the job. Please try again." };

    const ordered = values.serviceIds.map((id) => services.find((service) => service.id === id)!);
    const { error: itemsError } = await supabase.from("booking_items").insert(
        ordered.map((service, index) => ({
            business_id: auth.businessId,
            booking_id: booking.id,
            service_id: service.id,
            name: service.name,
            description: service.description,
            unit_price_cents: service.price_cents,
            duration_minutes: service.duration_minutes,
            sort_order: index,
        })),
    );
    if (itemsError) return { error: "The job was created, but its services couldn't be saved. Open it to fix." };

    sendQueuedEmailsSoon(booking.id);
    redirect(bookingPath(booking.id));
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export async function saveHours(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const rows: Array<{ business_id: string; weekday: number; opens_at: string; closes_at: string }> = [];
    const fieldErrors: Record<string, string[]> = {};
    for (let weekday = 0; weekday < 7; weekday += 1) {
        if (formData.get(`open-${weekday}`) !== "on") continue;
        const opens = text(formData, `opens-${weekday}`);
        const closes = text(formData, `closes-${weekday}`);
        if (!timeKey.safeParse(opens).success || !timeKey.safeParse(closes).success || closes <= opens) {
            fieldErrors[`day-${weekday}`] = ["Closing time must be after opening time."];
            continue;
        }
        rows.push({ business_id: auth.businessId, weekday, opens_at: opens, closes_at: closes });
    }
    if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Check the highlighted days." };

    const supabase = await createClient();
    const { error: clearError } = await supabase.from("business_hours").delete().eq("business_id", auth.businessId);
    if (clearError) return { error: "We couldn't save your hours." };
    if (rows.length) {
        const { error } = await supabase.from("business_hours").insert(rows);
        if (error) return { error: "We couldn't save your hours." };
    }
    refresh();
    return { success: "Hours saved." };
}

const rulesSchema = z.object({
    bookingLeadTimeMinutes: z.coerce.number().int().min(0).max(10080),
    bookingWindowDays: z.coerce.number().int().min(1).max(365),
    slotIntervalMinutes: z.coerce.number().int().refine((value) => [10, 15, 20, 30, 45, 60, 90, 120].includes(value)),
    bufferMinutes: z.coerce.number().int().min(0).max(240),
    arrivalWindowMinutes: z.coerce.number().int().min(0).max(480),
    cancellationWindowHours: z.coerce.number().int().min(0).max(720),
    depositRefundPolicy: z.enum(["refundable", "refundable_before_window", "non_refundable"]),
    autoConfirm: z.boolean(),
    allowCustomerReschedule: z.boolean(),
});

export async function saveBookingRules(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const parsed = rulesSchema.safeParse({
        bookingLeadTimeMinutes: text(formData, "bookingLeadTimeMinutes"),
        bookingWindowDays: text(formData, "bookingWindowDays"),
        slotIntervalMinutes: text(formData, "slotIntervalMinutes"),
        bufferMinutes: text(formData, "bufferMinutes"),
        arrivalWindowMinutes: text(formData, "arrivalWindowMinutes"),
        cancellationWindowHours: text(formData, "cancellationWindowHours"),
        depositRefundPolicy: text(formData, "depositRefundPolicy"),
        autoConfirm: formData.get("autoConfirm") === "on",
        allowCustomerReschedule: formData.get("allowCustomerReschedule") === "on",
    });
    if (!parsed.success) return invalid(parsed.error);
    const values = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase
        .from("businesses")
        .update({
            booking_lead_time_minutes: values.bookingLeadTimeMinutes,
            booking_window_days: values.bookingWindowDays,
            slot_interval_minutes: values.slotIntervalMinutes,
            buffer_minutes: values.bufferMinutes,
            arrival_window_minutes: values.arrivalWindowMinutes,
            cancellation_window_hours: values.cancellationWindowHours,
            deposit_refund_policy: values.depositRefundPolicy,
            auto_confirm: values.autoConfirm,
            allow_customer_reschedule: values.allowCustomerReschedule,
        })
        .eq("id", auth.businessId);
    if (error) return { error: "We couldn't save your booking rules." };
    refresh();
    return { success: "Booking rules saved." };
}

export async function addTimeOff(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const parsed = z
        .object({
            startDate: z.string().refine(isDateKey, { error: "Pick a start date." }),
            endDate: z.string().refine(isDateKey, { error: "Pick an end date." }),
            memberId: z.union([z.literal(""), z.uuid()]),
            reason: z.string().max(200),
        })
        .refine((values) => values.endDate >= values.startDate, { path: ["endDate"], error: "End date can't be before the start." })
        .safeParse({
            startDate: text(formData, "startDate"),
            endDate: text(formData, "endDate"),
            memberId: text(formData, "memberId"),
            reason: text(formData, "reason"),
        });
    if (!parsed.success) return invalid(parsed.error);

    const timeZone = await businessTimezone(auth.businessId);
    const start = zonedToUtc(parsed.data.startDate, "00:00", timeZone);
    const [year, month, day] = parsed.data.endDate.split("-").map(Number);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    const end = zonedToUtc(nextDay, "00:00", timeZone);

    const supabase = await createClient();
    const { error } = await supabase.from("time_off").insert({
        business_id: auth.businessId,
        member_id: parsed.data.memberId || null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        reason: parsed.data.reason || null,
    });
    if (error) return { error: "We couldn't add that time off." };
    refresh();
    return { success: "Time off added. Those days won't be bookable." };
}

export async function deleteTimeOff(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const supabase = await createClient();
    const { error } = await supabase.from("time_off").delete().eq("id", text(formData, "timeOffId")).eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't remove that time off." };
    refresh();
    return { success: "Time off removed." };
}
