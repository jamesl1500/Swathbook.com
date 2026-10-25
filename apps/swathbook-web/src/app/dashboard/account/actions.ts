"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE } from "@/libs/active-business";
import { getCurrentUser } from "@/libs/auth";
import { invalid, text, type FormState } from "@/libs/forms";
import { routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";
import { createClient } from "@/libs/supabase/server";
import { changeEmailSchema, changeNameSchema, changePasswordSchema, deleteAccountSchema } from "@/libs/validation/auth";

const SIGNED_OUT: FormState = { error: "Your session ended. Log in again to change your account." };
const WRONG_PASSWORD = { fieldErrors: { currentPassword: ["That password isn't right."] } } satisfies FormState;
const RATE_LIMITED = "Too many attempts. Wait a minute and try again.";

function rateLimited(code?: string) {
    return code === "over_email_send_rate_limit" || code === "over_request_rate_limit";
}

/**
 * Re-checks the password on the current session before sensitive changes. A
 * failed sign-in leaves the session alone; a successful one refreshes it, which
 * also satisfies Supabase's "recent login" rule for password changes.
 */
async function verifyPassword(supabase: Awaited<ReturnType<typeof createClient>>, email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return "ok" as const;
    return rateLimited(error.code) ? ("rate_limited" as const) : ("wrong" as const);
}

export async function updateName(_prev: FormState, formData: FormData): Promise<FormState> {
    const user = await getCurrentUser();
    if (!user) return SIGNED_OUT;

    const parsed = changeNameSchema.safeParse({ fullName: text(formData, "fullName") });
    if (!parsed.success) return invalid(parsed.error);
    const { fullName } = parsed.data;

    const supabase = await createClient();
    // Teammates see the profile; the session's metadata drives the app header.
    const [{ error: profileError }, { error: authError }] = await Promise.all([
        supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id),
        supabase.auth.updateUser({ data: { full_name: fullName } }),
    ]);
    if (profileError || authError) return { error: "We couldn't save your name. Please try again." };

    // Re-issue the JWT so claims (and getCurrentUser) carry the new name.
    await supabase.auth.refreshSession();
    refresh();
    return { success: "Name saved." };
}

export async function changeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
    const user = await getCurrentUser();
    if (!user) return SIGNED_OUT;

    const parsed = changeEmailSchema.safeParse({ email: text(formData, "email"), currentPassword: formData.get("currentPassword") ?? "" });
    if (!parsed.success) return invalid(parsed.error);
    const { email, currentPassword } = parsed.data;
    if (email === user.email.toLowerCase()) return { fieldErrors: { email: ["That's already your email."] } };

    const supabase = await createClient();
    const check = await verifyPassword(supabase, user.email, currentPassword);
    if (check === "rate_limited") return { error: RATE_LIMITED };
    if (check === "wrong") return WRONG_PASSWORD;

    const { error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: `${await getSiteUrl()}${routes.authConfirm}?next=${routes.account}` },
    );
    if (error) {
        if (error.code === "email_exists" || error.code === "user_already_exists") {
            return { fieldErrors: { email: ["Another account already uses that email."] } };
        }
        if (rateLimited(error.code)) return { error: RATE_LIMITED };
        return { error: "We couldn't start the email change. Please try again." };
    }

    refresh();
    return {
        success: `Check ${email} for a confirmation link. If one also arrives at ${user.email}, confirm that too. Your email changes once it's confirmed.`,
    };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
    const user = await getCurrentUser();
    if (!user) return SIGNED_OUT;

    const parsed = changePasswordSchema.safeParse({
        currentPassword: formData.get("currentPassword") ?? "",
        password: formData.get("password") ?? "",
        confirmPassword: formData.get("confirmPassword") ?? "",
    });
    if (!parsed.success) return invalid(parsed.error);
    const { currentPassword, password } = parsed.data;

    const supabase = await createClient();
    const check = await verifyPassword(supabase, user.email, currentPassword);
    if (check === "rate_limited") return { error: RATE_LIMITED };
    if (check === "wrong") return WRONG_PASSWORD;

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        if (error.code === "same_password") return { fieldErrors: { password: ["That's your current password. Pick a new one."] } };
        if (error.code === "weak_password") return { fieldErrors: { password: [error.message] } };
        return { error: "We couldn't change your password. Please try again." };
    }
    return { success: "Password changed." };
}

/**
 * Deletes the signed-in user, every business they own and everything in those
 * businesses. Memberships in other people's businesses end with the account.
 */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
    const user = await getCurrentUser();
    if (!user) return SIGNED_OUT;

    const parsed = deleteAccountSchema.safeParse({
        confirmation: text(formData, "confirmation"),
        currentPassword: formData.get("currentPassword") ?? "",
    });
    if (!parsed.success) return invalid(parsed.error);

    const supabase = await createClient();
    const check = await verifyPassword(supabase, user.email, parsed.data.currentPassword);
    if (check === "rate_limited") return { error: RATE_LIMITED };
    if (check === "wrong") return WRONG_PASSWORD;

    const admin = createAdminClient();
    const { data: owned } = await admin.from("businesses").select("id").eq("owner_id", user.id);
    const businessIds = (owned ?? []).map((business) => business.id);
    // Read before deleting: the subscription rows go with the businesses.
    const { data: liveSubscriptions } = businessIds.length
        ? await admin
              .from("subscriptions")
              .select("stripe_subscription_id")
              .in("business_id", businessIds)
              .not("status", "in", "(canceled,incomplete_expired)")
        : { data: [] };

    const { error } = await admin.rpc("delete_account", { p_user_id: user.id });
    if (error) {
        if (error.message === "upcoming_jobs") {
            const count = Number(error.details) || 0;
            return {
                error: `Your businesses still have ${count === 1 ? "an upcoming job" : `${count} upcoming jobs`}. Cancel or finish ${count === 1 ? "it" : "them"} first so no customer is left waiting.`,
            };
        }
        return { error: "We couldn't delete your account. Please try again or contact support." };
    }

    await cancelPlans((liveSubscriptions ?? []).map((row) => row.stripe_subscription_id));
    await removeBusinessFiles(admin, businessIds);
    await supabase.auth.signOut();
    (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
    redirect(`${routes.login}?notice=account_deleted`);
}

/** Stops Swathbook billing for deleted businesses. Best effort; Stripe failures are logged. */
async function cancelPlans(subscriptionIds: string[]) {
    if (!subscriptionIds.length || !hasStripe()) return;
    const stripe = getStripe();
    for (const id of subscriptionIds) {
        try {
            await stripe.subscriptions.cancel(id);
        } catch (error) {
            console.error(`[account] couldn't cancel subscription ${id}`, error);
        }
    }
}

const BUSINESS_BUCKETS = ["business-assets", "job-files"] as const;

/** Best effort: storage isn't transactional with the database, so log and move on. */
async function removeBusinessFiles(admin: ReturnType<typeof createAdminClient>, businessIds: string[]) {
    for (const bucket of BUSINESS_BUCKETS) {
        for (const businessId of businessIds) {
            try {
                const paths = await listFiles(admin, bucket, businessId);
                if (paths.length) await admin.storage.from(bucket).remove(paths);
            } catch (error) {
                console.error(`[account] couldn't remove ${bucket}/${businessId}`, error);
            }
        }
    }
}

async function listFiles(admin: ReturnType<typeof createAdminClient>, bucket: string, folder: string): Promise<string[]> {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw error;
    const nested = await Promise.all(
        (data ?? []).map((entry) =>
            // Folders come back without an id.
            entry.id ? Promise.resolve([`${folder}/${entry.name}`]) : listFiles(admin, bucket, `${folder}/${entry.name}`),
        ),
    );
    return nested.flat();
}
