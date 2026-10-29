"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readAddress, withCoordinates } from "@/libs/address";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { checkbox, invalid, text, type FormState } from "@/libs/forms";
import { customerPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";

const customerSchema = z.object({
    fullName: z.string().trim().min(1, { error: "Enter the customer's name." }).max(120),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }))]),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ().-]{7,20}$/, { error: "Enter a valid phone number." })]),
    notes: z.string().trim().max(2000),
    tags: z
        .string()
        .transform((value) => [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20))
        .pipe(z.array(z.string().max(30, { error: "Keep tags under 30 characters." }))),
    emailOptIn: z.boolean(),
    smsOptIn: z.boolean(),
});

function readCustomer(formData: FormData) {
    return customerSchema.safeParse({
        fullName: text(formData, "fullName"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        notes: text(formData, "notes"),
        tags: text(formData, "tags"),
        emailOptIn: checkbox(formData, "emailOptIn"),
        smsOptIn: checkbox(formData, "smsOptIn"),
    });
}

function customerRow(values: z.output<typeof customerSchema>) {
    return {
        full_name: values.fullName,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null,
        tags: values.tags,
        email_opt_in: values.emailOptIn,
        sms_opt_in: values.smsOptIn,
    };
}

export async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const customer = readCustomer(formData);
    if (!customer.success) return invalid(customer.error);
    const hasAddress = text(formData, "address.line1") !== "";
    const address = hasAddress ? readAddress(formData) : null;
    if (address && !address.success) return invalid(address.error);

    const supabase = await createClient();
    const { data: created, error } = await supabase
        .from("customers")
        .insert({ ...customerRow(customer.data), business_id: auth.businessId })
        .select("id")
        .single();
    if (error || !created) {
        if (error?.code === "23505") return { fieldErrors: { email: ["You already have a customer with this email."] } };
        return { error: "We couldn't add that customer. Please try again." };
    }

    if (address?.success) {
        await supabase
            .from("customer_addresses")
            .insert({ ...(await withCoordinates(address.data)), business_id: auth.businessId, customer_id: created.id, is_primary: true });
    }
    redirect(customerPath(created.id));
}

export async function updateCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const customer = readCustomer(formData);
    if (!customer.success) return invalid(customer.error);

    const supabase = await createClient();
    const { error } = await supabase
        .from("customers")
        .update(customerRow(customer.data))
        .eq("id", text(formData, "customerId"))
        .eq("business_id", auth.businessId);
    if (error) {
        if (error.code === "23505") return { fieldErrors: { email: ["You already have a customer with this email."] } };
        return { error: "We couldn't save those changes." };
    }
    refresh();
    return { success: "Customer saved." };
}

export async function deleteCustomer(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const supabase = await createClient();
    const { error } = await supabase.from("customers").delete().eq("id", text(formData, "customerId")).eq("business_id", auth.businessId);
    if (error) {
        if (error.code === "23503") return { error: "This customer has bookings or payments, so they can't be deleted." };
        return { error: "We couldn't delete this customer." };
    }
    redirect(routes.customers);
}

export async function saveAddress(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const address = readAddress(formData);
    if (!address.success) return invalid(address.error);
    const customerId = text(formData, "customerId");
    const addressId = text(formData, "addressId");
    const row = {
        ...(await withCoordinates(address.data)),
        label: text(formData, "label").slice(0, 40) || null,
        access_notes: text(formData, "accessNotes").slice(0, 500) || null,
    };

    const supabase = await createClient();
    if (addressId) {
        const { error } = await supabase.from("customer_addresses").update(row).eq("id", addressId).eq("business_id", auth.businessId);
        if (error) return { error: "We couldn't save that address." };
    } else {
        const { count } = await supabase
            .from("customer_addresses")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", customerId)
            .eq("is_primary", true);
        const { error } = await supabase
            .from("customer_addresses")
            .insert({ ...row, business_id: auth.businessId, customer_id: customerId, is_primary: !count });
        if (error) return { error: "We couldn't add that address." };
    }
    refresh();
    return { success: addressId ? "Address saved." : "Address added." };
}

export async function deleteAddress(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const supabase = await createClient();
    const { error } = await supabase.from("customer_addresses").delete().eq("id", text(formData, "addressId")).eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't remove that address." };
    refresh();
    return { success: "Address removed." };
}

export async function makePrimaryAddress(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const supabase = await createClient();
    const customerId = text(formData, "customerId");
    // One primary per customer (unique index), so clear first.
    await supabase.from("customer_addresses").update({ is_primary: false }).eq("customer_id", customerId).eq("business_id", auth.businessId);
    const { error } = await supabase
        .from("customer_addresses")
        .update({ is_primary: true })
        .eq("id", text(formData, "addressId"))
        .eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't update the primary address." };
    refresh();
    return { success: "Primary address updated." };
}
