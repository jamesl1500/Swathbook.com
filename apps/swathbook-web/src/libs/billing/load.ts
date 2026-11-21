/**
 * load.ts
 *
 * Reads a business's billing for the dashboard: its trial or plan, its team
 * seats, and Swathbook's 1.25% fees on recent customer payments. Owners and
 * admins only: subscriptions and payments are readable to managers through RLS.
 *
 * @module src/libs/billing/load
 * @since 1.0.0
 */

import type { createClient } from "@/libs/supabase/server";
import { billingState } from "./status";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadBilling(supabase: Supabase, business: { id: string; trial_ends_at: string | null }) {
    const [{ data: subscription }, { data: seats }] = await Promise.all([
        supabase
            .from("subscriptions")
            .select("plan, status, current_period_end, cancel_at_period_end, trial_end")
            .eq("business_id", business.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase.rpc("team_seats", { p_business_id: business.id }).maybeSingle(),
    ]);
    return {
        state: billingState({ trialEndsAt: business.trial_ends_at, subscription }),
        subscription,
        seats: { used: seats?.used ?? 1, limit: seats?.seat_limit ?? null },
    };
}

export const FEE_SUMMARY_DAYS = 30;

const COLLECTED = ["succeeded", "partially_refunded", "refunded"] as const;

type PaymentRow = { amount_cents: number; amount_refunded_cents: number; application_fee_cents: number };

export type FeeSummary = { payments: number; collectedCents: number; feeCents: number };

/**
 * Totals after refunds. A refund returns Swathbook's fee pro rata, so the fee
 * kept is the share of the payment the customer didn't get back.
 */
export function summarizeFees(rows: PaymentRow[]): FeeSummary {
    let collectedCents = 0;
    let feeCents = 0;
    for (const row of rows) {
        const kept = Math.max(0, row.amount_cents - row.amount_refunded_cents);
        collectedCents += kept;
        feeCents += row.amount_cents > 0 ? Math.round((row.application_fee_cents * kept) / row.amount_cents) : 0;
    }
    return { payments: rows.length, collectedCents, feeCents };
}

/** Swathbook's fees on the business's customer payments over the last FEE_SUMMARY_DAYS. */
export async function loadFeeSummary(supabase: Supabase, businessId: string, now = Date.now()) {
    const since = new Date(now - FEE_SUMMARY_DAYS * 86_400_000).toISOString();
    const { data } = await supabase
        .from("payments")
        .select("amount_cents, amount_refunded_cents, application_fee_cents")
        .eq("business_id", businessId)
        .in("status", [...COLLECTED])
        .gte("created_at", since);
    return summarizeFees(data ?? []);
}
