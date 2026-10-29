/**
 * plans.ts
 *
 * Swathbook's own plans (what businesses pay us). Prices live in Stripe under
 * these lookup keys and are created on first use, so test and live mode set
 * themselves up. Seat limits mirror private.seat_limit() in the database.
 *
 * @module src/libs/billing/plans
 * @since 1.0.0
 */

export const TRIAL_DAYS = 14;

export const PLANS = {
    solo: {
        name: "Solo",
        priceCents: 2900,
        lookupKey: "swathbook_solo_monthly",
        seats: 1,
        summary: "One person running the business.",
        features: ["Your booking link", "Unlimited services & bookings", "Deposits and card payments", "AI routes for 1 driver", "Email confirmations & reminders"],
    },
    crew: {
        name: "Crew",
        priceCents: 7900,
        lookupKey: "swathbook_crew_monthly",
        seats: 5,
        summary: "A team of up to 5, including you.",
        features: ["Everything in Solo", "Up to 5 team members", "Routes for every driver", "Assign jobs to your crew", "Priority support"],
    },
} as const;

export type PaidPlan = keyof typeof PLANS;

export function isPaidPlan(value: unknown): value is PaidPlan {
    return value === "solo" || value === "crew";
}

/** The plan a Stripe price belongs to, by lookup key. */
export function planForLookupKey(lookupKey: string | null | undefined): PaidPlan | null {
    for (const [plan, config] of Object.entries(PLANS)) if (config.lookupKey === lookupKey) return plan as PaidPlan;
    return null;
}
