"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import type { FormState } from "@/libs/forms";
import { getSiteUrl } from "@/libs/site-url";
import { createConnectedAccount, createOnboardingLink, retrieveAccountStatus, saveConnectStatus } from "@/libs/stripe/connect";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";

/** Only the owner can connect a bank account or open the Express Dashboard. */
async function authorizeOwner(formData: FormData) {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    if (auth.role !== "owner") return { error: "Only the business owner can manage payouts." };
    if (!hasStripe()) return { error: "Payments aren't configured on this server yet." };
    return auth;
}

/**
 * Creates the business's Stripe account on first use, then sends the owner to
 * Stripe-hosted onboarding.
 */
export async function startPayoutsOnboarding(formData: FormData): Promise<FormState> {
    const auth = await authorizeOwner(formData);
    if (isFailure(auth)) return auth;

    const stripe = getStripe();
    const admin = createAdminClient();
    const { data: existing } = await admin
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("business_id", auth.businessId)
        .maybeSingle();

    let accountId = existing?.stripe_account_id;
    let linkUrl: string;
    try {
        if (!accountId) {
            const account = await createConnectedAccount(stripe, {
                businessId: auth.businessId,
                businessName: auth.business.name,
                email: auth.user.email,
            });
            accountId = account.id;
            await saveConnectStatus(admin, auth.businessId, {
                stripeAccountId: account.id,
                chargesEnabled: false,
                payoutsEnabled: false,
                detailsSubmitted: false,
                requirementsDue: [],
                disabledReason: null,
            });
        }
        linkUrl = await createOnboardingLink(stripe, accountId, await getSiteUrl());
    } catch (error) {
        console.error("[payouts] onboarding failed", error);
        return { error: "We couldn't reach Stripe. Please try again in a moment." };
    }
    redirect(linkUrl);
}

export async function openExpressDashboard(formData: FormData): Promise<FormState> {
    const auth = await authorizeOwner(formData);
    if (isFailure(auth)) return auth;

    const { data: account } = await createAdminClient()
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("business_id", auth.businessId)
        .maybeSingle();
    if (!account) return { error: "Set up payouts first." };

    let url: string;
    try {
        url = (await getStripe().accounts.createLoginLink(account.stripe_account_id)).url;
    } catch (error) {
        console.error("[payouts] login link failed", error);
        return { error: "Stripe couldn't open your dashboard. Finish setup first, then try again." };
    }
    redirect(url);
}

/** Pulls the latest status from Stripe (webhooks normally keep it current). */
export async function refreshPayoutStatus(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    if (!hasStripe()) return { error: "Payments aren't configured on this server yet." };

    const admin = createAdminClient();
    const { data: account } = await admin
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("business_id", auth.businessId)
        .maybeSingle();
    if (!account) return { error: "Set up payouts first." };

    try {
        await saveConnectStatus(admin, auth.businessId, await retrieveAccountStatus(getStripe(), account.stripe_account_id));
    } catch (error) {
        console.error("[payouts] refresh failed", error);
        return { error: "We couldn't reach Stripe. Please try again." };
    }
    refresh();
    return { success: "Payout status updated." };
}
