"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getPostAuthPath } from "@/libs/auth";
import { routes, safeNextPath } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createClient } from "@/libs/supabase/server";
import {
    forgotPasswordSchema,
    resetPasswordSchema,
    signInSchema,
    signUpSchema,
} from "@/libs/validation/auth";

export type AuthFormState = {
    error?: string;
    success?: string;
    fieldErrors?: Partial<Record<string, string[]>>;
    /** Echoed back so fields keep their values after a failed submit. */
    values?: Record<string, string>;
};

function text(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
}

function rateLimited(code?: string) {
    return code === "over_email_send_rate_limit" || code === "over_request_rate_limit";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
    const values = { email: text(formData, "email") };
    const parsed = signInSchema.safeParse({ email: values.email, password: text(formData, "password") });
    if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
        if (error.code === "email_not_confirmed") {
            redirect(`${routes.verifyEmail}?email=${encodeURIComponent(parsed.data.email)}`);
        }
        if (rateLimited(error.code)) {
            return { error: "Too many attempts. Wait a minute and try again.", values };
        }
        return { error: "That email and password don't match. Try again or reset your password.", values };
    }

    redirect(safeNextPath(text(formData, "next")) ?? (await getPostAuthPath(data.user.id)));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
    const values = {
        fullName: text(formData, "fullName"),
        email: text(formData, "email"),
        slug: text(formData, "slug"),
    };
    const parsed = signUpSchema.safeParse({ ...values, password: text(formData, "password") });
    if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
    }

    const { fullName, email, password, slug } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${await getSiteUrl()}${routes.authConfirm}?next=${routes.onboarding}`,
            data: { full_name: fullName, desired_slug: slug || null },
        },
    });

    if (error) {
        if (error.code === "user_already_exists" || error.code === "email_exists") {
            return { error: "There's already an account with that email. Try logging in instead.", values };
        }
        if (error.code === "weak_password") {
            return { fieldErrors: { password: [error.message] }, values };
        }
        if (rateLimited(error.code)) {
            return { error: "Too many sign-up attempts. Wait a minute and try again.", values };
        }
        return { error: "We couldn't create your account. Please try again.", values };
    }

    // Email confirmation off: we already have a session.
    if (data.session) redirect(routes.onboarding);

    redirect(`${routes.verifyEmail}?email=${encodeURIComponent(email)}`);
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
    const values = { email: text(formData, "email") };
    const parsed = forgotPasswordSchema.safeParse(values);
    if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${await getSiteUrl()}${routes.authConfirm}?next=${routes.resetPassword}`,
    });

    if (rateLimited(error?.code)) {
        return { error: "We just sent one. Wait a minute before asking for another.", values };
    }

    // Same answer whether or not the account exists, so emails can't be probed.
    return {
        success: `If there's an account for ${parsed.data.email}, a reset link is on its way. It expires in an hour.`,
        values,
    };
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
    const parsed = resetPasswordSchema.safeParse({
        password: text(formData, "password"),
        confirmPassword: text(formData, "confirmPassword"),
    });
    if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error || !data.user) {
        if (error?.code === "same_password") {
            return { fieldErrors: { password: ["Pick a password you haven't used before."] } };
        }
        if (error?.code === "weak_password") {
            return { fieldErrors: { password: [error.message] } };
        }
        return { error: "Your reset link has expired. Request a new one and try again." };
    }

    redirect(await getPostAuthPath(data.user.id));
}

export async function resendVerification(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
    const values = { email: text(formData, "email") };
    const parsed = forgotPasswordSchema.safeParse(values);
    if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
        type: "signup",
        email: parsed.data.email,
        options: { emailRedirectTo: `${await getSiteUrl()}${routes.authConfirm}?next=${routes.onboarding}` },
    });

    if (error) {
        return {
            error: rateLimited(error.code)
                ? "We just sent one. Give it a minute before trying again."
                : "We couldn't resend the email. Please try again.",
            values,
        };
    }

    return { success: `Sent a fresh link to ${parsed.data.email}.`, values };
}

export async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(routes.login);
}
