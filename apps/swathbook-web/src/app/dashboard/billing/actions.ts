"use server";

import { redirect } from "next/navigation";
import { createPortalSession, isMissingResource } from "@/libs/billing/stripe-billing";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import type { FormState } from "@/libs/forms";
import { routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";

const NOT_CONFIGURED = "Billing isn't configured yet. Add your Stripe keys to turn it on.";
const NO_PLAN = "There's no plan to manage. Swathbook only takes its fee from customer payments.";

async function ownerOnly(businessId: FormDataEntryValue | null) {
    const auth = await authorizeBusiness(businessId, { manage: true });
    if (isFailure(auth)) return auth;
    if (auth.role !== "owner") return { error: "Only the business owner can change billing." };
    return auth;
}

/** Opens Stripe's billing portal, where an owner can cancel a plan bought before per-payment pricing. */
export async function openBillingPortal(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await ownerOnly(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    if (!hasStripe()) return { error: NOT_CONFIGURED };

    const { data: business } = await createAdminClient().from("businesses").select("stripe_customer_id").eq("id", auth.businessId).single();
    if (!business?.stripe_customer_id) return { error: NO_PLAN };

    let url: string;
    try {
        url = await createPortalSession(getStripe(), business.stripe_customer_id, `${await getSiteUrl()}${routes.billing}`);
    } catch (error) {
        if (isMissingResource(error)) {
            // The saved customer isn't in this Stripe account: forget it, there's nothing there to manage.
            await createAdminClient().from("businesses").update({ stripe_customer_id: null }).eq("id", auth.businessId);
            return { error: NO_PLAN };
        }
        console.error("[billing] portal failed", error);
        return { error: "We couldn't open billing. Please try again." };
    }
    redirect(url);
}
