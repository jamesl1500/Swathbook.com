/**
 * connect.ts
 *
 * Stripe Connect for businesses: create the connected account (Accounts v2,
 * Express Dashboard, Stripe-managed fees and risk), send owners through
 * Stripe-hosted onboarding, and mirror the account's status into
 * stripe_connect_accounts.
 *
 * @module src/libs/stripe/connect
 * @since 1.0.0
 */

import type Stripe from "stripe";
import type { createAdminClient } from "@/libs/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type V2Account = Stripe.V2.Core.Account;

export type ConnectStatus = {
    stripeAccountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
    disabledReason: string | null;
};

const ACCOUNT_INCLUDES: Stripe.V2.Core.AccountRetrieveParams.Include[] = ["configuration.merchant", "requirements", "identity"];

export async function createConnectedAccount(
    stripe: Stripe,
    { businessId, businessName, email }: { businessId: string; businessName: string; email: string },
) {
    return stripe.v2.core.accounts.create(
        {
            contact_email: email,
            display_name: businessName,
            dashboard: "express",
            identity: { country: "us" },
            configuration: {
                merchant: { capabilities: { card_payments: { requested: true } } },
            },
            defaults: {
                currency: "usd",
                locales: ["en-US"],
                responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
            },
            include: ACCOUNT_INCLUDES,
            metadata: { business_id: businessId },
        },
        { idempotencyKey: `connect-account:${businessId}` },
    );
}

/** A single-use, short-lived link into Stripe-hosted onboarding. */
export async function createOnboardingLink(stripe: Stripe, accountId: string, siteUrl: string) {
    const link = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
            type: "account_onboarding",
            account_onboarding: {
                collection_options: { fields: "eventually_due" },
                refresh_url: `${siteUrl}/dashboard/payouts/refresh`,
                return_url: `${siteUrl}/dashboard/payouts/return`,
            },
        },
    });
    return link.url;
}

export function summarizeAccount(account: V2Account): ConnectStatus {
    const capabilities = account.configuration?.merchant?.capabilities;
    const card = capabilities?.card_payments;
    const payouts = capabilities?.stripe_balance?.payouts;
    const outstanding = (account.requirements?.entries ?? []).filter((entry) =>
        ["currently_due", "past_due"].includes(entry.minimum_deadline?.status),
    );
    return {
        stripeAccountId: account.id,
        chargesEnabled: card?.status === "active",
        payoutsEnabled: payouts?.status === "active",
        detailsSubmitted: outstanding.length === 0,
        requirementsDue: [...new Set(outstanding.map((entry) => entry.description))].slice(0, 20),
        disabledReason: card && card.status !== "active" ? (card.status_details?.[0]?.code ?? card.status) : null,
    };
}

export async function retrieveAccountStatus(stripe: Stripe, accountId: string) {
    const account = await stripe.v2.core.accounts.retrieve(accountId, { include: ACCOUNT_INCLUDES });
    return summarizeAccount(account);
}

/** Writes the account's status to stripe_connect_accounts (service role). */
export async function saveConnectStatus(admin: AdminClient, businessId: string, status: ConnectStatus) {
    const { error } = await admin.from("stripe_connect_accounts").upsert(
        {
            business_id: businessId,
            stripe_account_id: status.stripeAccountId,
            account_type: "express",
            country: "US",
            default_currency: "usd",
            charges_enabled: status.chargesEnabled,
            payouts_enabled: status.payoutsEnabled,
            details_submitted: status.detailsSubmitted,
            requirements_due: status.requirementsDue,
            disabled_reason: status.disabledReason,
        },
        { onConflict: "business_id" },
    );
    if (error) throw new Error(`Couldn't save Stripe account status: ${error.message}`);
}

/** Looks up which business a connected account belongs to and refreshes its status. */
export async function syncConnectAccount(stripe: Stripe, admin: AdminClient, accountId: string) {
    const { data: row } = await admin
        .from("stripe_connect_accounts")
        .select("business_id")
        .eq("stripe_account_id", accountId)
        .maybeSingle();
    if (!row) return null;
    const status = await retrieveAccountStatus(stripe, accountId);
    await saveConnectStatus(admin, row.business_id, status);
    return status;
}
