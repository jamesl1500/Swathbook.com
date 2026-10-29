"use server";

import { redirect } from "next/navigation";
import { createCheckoutSession, createPortalSession } from "@/libs/billing/stripe-billing";
import { isPaidPlan } from "@/libs/billing/plans";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import type { FormState } from "@/libs/forms";
import { routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";

const NOT_CONFIGURED = "Billing isn't configured yet. Add your Stripe keys to turn it on.";

async function ownerOnly(businessId: FormDataEntryValue | null) {
    const auth = await authorizeBusiness(businessId, { manage: true });
    if (isFailure(auth)) return auth;
    if (auth.role !== "owner") return { error: "Only the business owner can change billing." };
    return auth;
}

export async function startCheckout(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await ownerOnly(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    const plan = formData.get("plan");
    if (!isPaidPlan(plan)) return { error: "Pick a plan." };
    if (!hasStripe()) return { error: NOT_CONFIGURED };

    const admin = createAdminClient();
    const { data: business } = await admin
        .from("businesses")
        .select("id, name, stripe_customer_id, trial_ends_at")
        .eq("id", auth.businessId)
        .single();
    if (!business) return { error: "We couldn't find that business." };

    let url: string | null;
    try {
        url = await createCheckoutSession(getStripe(), admin, {
            business,
            plan,
            email: auth.user.email,
            returnUrl: `${await getSiteUrl()}${routes.billing}`,
        });
    } catch (error) {
        console.error("[billing] checkout failed", error);
        return { error: "We couldn't start checkout. Please try again." };
    }
    if (!url) return { error: "We couldn't start checkout. Please try again." };
    redirect(url);
}

export async function openBillingPortal(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await ownerOnly(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    if (!hasStripe()) return { error: NOT_CONFIGURED };

    const { data: business } = await createAdminClient().from("businesses").select("stripe_customer_id").eq("id", auth.businessId).single();
    if (!business?.stripe_customer_id) return { error: "Choose a plan first." };

    let url: string;
    try {
        url = await createPortalSession(getStripe(), business.stripe_customer_id, `${await getSiteUrl()}${routes.billing}`);
    } catch (error) {
        console.error("[billing] portal failed", error);
        return { error: "We couldn't open billing. Please try again." };
    }
    redirect(url);
}
