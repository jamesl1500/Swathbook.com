"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCustomer } from "@/libs/customer";
import { deleteCustomerLogin } from "@/libs/customer-account";
import { text, type FormState } from "@/libs/forms";
import { routes, safeNextPath } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { customerCodeSchema, customerDetailsSchema, customerEmailSchema } from "@/libs/validation/customer";

export type CustomerSignInState = {
    step: "email" | "code";
    email: string;
    error?: string;
    notice?: string;
    fieldErrors?: Partial<Record<"email" | "code", string[]>>;
};

function rateLimited(error: { code?: string; status?: number }) {
    return error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429;
}

async function sendCode(email: string) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            // The first code also creates the account; entering it confirms the email,
            // which is what links the login to bookings made with that address.
            shouldCreateUser: true,
            // Picks the code version of the "confirm signup" email (supabase/templates).
            data: { customer_app: true },
        },
    });
    return error;
}

/**
 * The customer sign-in form, one step at a time: send a code to an email
 * (`intent=send`), check it (`verify`), send another (`resend`) or start
 * over with a different email (`change`). Same answer whether or not the
 * email already has an account, so it can't be used to probe for them.
 */
export async function customerSignIn(prev: CustomerSignInState, formData: FormData): Promise<CustomerSignInState> {
    const intent = text(formData, "intent");
    const next = safeNextPath(text(formData, "next"));

    if (intent === "change") return { step: "email", email: prev.email };

    if (intent === "send" || intent === "resend") {
        const parsed = customerEmailSchema.safeParse({ email: text(formData, "email") });
        if (!parsed.success) {
            return { step: "email", email: text(formData, "email"), fieldErrors: z.flattenError(parsed.error).fieldErrors };
        }
        const { email } = parsed.data;
        const error = await sendCode(email);
        if (error) {
            if (rateLimited(error)) {
                return { step: intent === "resend" ? "code" : "email", email, error: "We just sent a code. Wait a minute, then try again." };
            }
            console.error("[customer] sending a sign-in code failed", error.code ?? error.message);
            return { step: intent === "resend" ? "code" : "email", email, error: "We couldn't send a code. Please try again." };
        }
        return { step: "code", email, notice: intent === "resend" ? "We sent a new code." : undefined };
    }

    if (intent === "verify") {
        const parsed = customerCodeSchema.safeParse({ email: text(formData, "email"), code: text(formData, "code") });
        if (!parsed.success) {
            const fieldErrors = z.flattenError(parsed.error).fieldErrors;
            // A bad email here means the form was tampered with: start over.
            if (fieldErrors.email) return { step: "email", email: "", fieldErrors };
            return { step: "code", email: text(formData, "email").toLowerCase(), fieldErrors };
        }
        const { email, code } = parsed.data;
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
        if (error) {
            if (rateLimited(error)) return { step: "code", email, error: "Too many tries. Wait a minute, then try again." };
            return { step: "code", email, fieldErrors: { code: ["That code is wrong or has expired. Check the email, or send a new code."] } };
        }
        redirect(next ?? routes.customerJobs);
    }

    return { step: "email", email: "" };
}

export async function signOutCustomer() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(`${routes.customerSignIn}?notice=signed_out`);
}

const DETAILS_ERRORS: Record<string, [field: string, message: string]> = {
    invalid_name: ["fullName", "Enter your name."],
    invalid_phone: ["phone", "Enter a valid phone number."],
    invalid_address: ["line1", "Enter a street address, or leave it blank."],
};

/** Name, phone and home address (used to prefill bookings). Blank street clears the address. */
export async function saveCustomerDetails(_prev: FormState, formData: FormData): Promise<FormState> {
    const customer = await getCustomer();
    if (!customer) return { error: "Your session has expired. Sign in again." };

    const parsed = customerDetailsSchema.safeParse({
        fullName: text(formData, "fullName"),
        phone: text(formData, "phone"),
        line1: text(formData, "line1"),
        line2: text(formData, "line2"),
        city: text(formData, "city"),
        region: text(formData, "region"),
        postalCode: text(formData, "postalCode"),
    });
    if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors, error: "Check the highlighted fields." };
    }

    const { fullName, phone, line1, line2, city, region, postalCode } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_my_details", {
        p_full_name: fullName,
        p_phone: phone || undefined,
        p_address: { line1, line2, city, region, postal_code: postalCode },
        p_finish_setup: true,
    });
    if (error) {
        const known = DETAILS_ERRORS[error.message];
        if (known) return { fieldErrors: { [known[0]]: [known[1]] }, error: "Check the highlighted fields." };
        console.error("[customer] saving details failed", error.code ?? error.message);
        return { error: "We couldn't save your details. Please try again." };
    }
    refresh();
    return { success: "Saved. New bookings will use these details." };
}

/** Deletes the customer's login (not their bookings, which belong to the businesses). */
export async function deleteCustomerAccount(_prev: FormState, formData: FormData): Promise<FormState> {
    const customer = await getCustomer();
    if (!customer) return { error: "Your session has expired. Sign in again." };
    if (text(formData, "confirm").toLowerCase() !== "delete") {
        return { fieldErrors: { confirm: ["Type DELETE to confirm."] }, error: "Type DELETE to confirm." };
    }

    const result = await deleteCustomerLogin(customer.id);
    if (!result.deleted) {
        return {
            error:
                result.reason === "has_business"
                    ? "This login is part of a business on Swathbook. Delete it from Account settings in your dashboard."
                    : "We couldn't delete your account. Please try again or contact support.",
        };
    }
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(`${routes.customerSignIn}?notice=account_deleted`);
}
