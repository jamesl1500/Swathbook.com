/**
 * load.ts
 *
 * What the billing page shows: Swathbook's fees on the business's recent
 * customer payments, and any monthly plan left over from before per-payment
 * pricing (so the owner can cancel it). Owners and admins only: payments and
 * subscriptions are readable to managers through RLS.
 *
 * @module src/libs/billing/load
 * @since 1.0.0
 */

import type { createClient } from "@/libs/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const FEE_SUMMARY_DAYS = 30;

const COLLECTED = ["succeeded", "partially_refunded", "refunded"] as const;
const LIVE_PLAN = ["trialing", "active", "past_due"] as const;

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

export async function loadBilling(supabase: Supabase, business: { id: string }, now = Date.now()) {
    const since = new Date(now - FEE_SUMMARY_DAYS * 86_400_000).toISOString();
    const [{ data: payments }, { data: subscription }] = await Promise.all([
        supabase
            .from("payments")
            .select("amount_cents, amount_refunded_cents, application_fee_cents")
            .eq("business_id", business.id)
            .in("status", [...COLLECTED])
            .gte("created_at", since),
        supabase
            .from("subscriptions")
            .select("plan, status, current_period_end, cancel_at_period_end")
            .eq("business_id", business.id)
            .in("status", [...LIVE_PLAN])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    return { fees: summarizeFees(payments ?? []), legacyPlan: subscription ?? null };
}
