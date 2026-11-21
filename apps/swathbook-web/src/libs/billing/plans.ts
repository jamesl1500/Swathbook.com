/**
 * plans.ts
 *
 * The monthly plans Swathbook sold before it moved to a per-payment fee (see
 * fees.ts). Nothing new is sold; these only let the webhook keep mirroring a
 * plan bought earlier, and the billing page name it, until it's cancelled.
 *
 * @module src/libs/billing/plans
 * @since 1.0.0
 */

export const LEGACY_PLANS = {
    solo: { name: "Solo", lookupKey: "swathbook_solo_monthly" },
    crew: { name: "Crew", lookupKey: "swathbook_crew_monthly" },
} as const;

export type PaidPlan = keyof typeof LEGACY_PLANS;

export function isPaidPlan(value: unknown): value is PaidPlan {
    return value === "solo" || value === "crew";
}

/** The plan a Stripe price belongs to, by lookup key. */
export function planForLookupKey(lookupKey: string | null | undefined): PaidPlan | null {
    for (const [plan, config] of Object.entries(LEGACY_PLANS)) if (config.lookupKey === lookupKey) return plan as PaidPlan;
    return null;
}
