/**
 * status.ts
 *
 * One reading of a business's billing state for the dashboard: trial, paid,
 * payment trouble, or paused. Mirrors private.business_has_access() so the
 * banner and the booking page always agree.
 *
 * @module src/libs/billing/status
 * @since 1.0.0
 */

import type { Database } from "@/libs/supabase/database.types";

type Subscription = Pick<
    Database["public"]["Tables"]["subscriptions"]["Row"],
    "plan" | "status" | "current_period_end" | "cancel_at_period_end" | "trial_end"
>;

export type BillingState =
    | { kind: "trial"; hasAccess: true; daysLeft: number; endsAt: string }
    | { kind: "active"; hasAccess: true; plan: Subscription["plan"]; renewsAt: string | null; cancelsAtPeriodEnd: boolean }
    | { kind: "past_due"; hasAccess: true; plan: Subscription["plan"] }
    | { kind: "lapsed"; hasAccess: false; reason: "trial_ended" | "canceled" | "unpaid" };

const LIVE = new Set(["trialing", "active", "past_due"]);

export function billingState(
    { trialEndsAt, subscription }: { trialEndsAt: string | null; subscription: Subscription | null },
    now = Date.now(),
): BillingState {
    if (subscription && LIVE.has(subscription.status)) {
        if (subscription.status === "past_due") return { kind: "past_due", hasAccess: true, plan: subscription.plan };
        return {
            kind: "active",
            hasAccess: true,
            plan: subscription.plan,
            renewsAt: subscription.current_period_end ?? subscription.trial_end,
            cancelsAtPeriodEnd: subscription.cancel_at_period_end,
        };
    }
    if (trialEndsAt && Date.parse(trialEndsAt) > now) {
        return { kind: "trial", hasAccess: true, daysLeft: Math.max(1, Math.ceil((Date.parse(trialEndsAt) - now) / 86_400_000)), endsAt: trialEndsAt };
    }
    if (subscription?.status === "unpaid") return { kind: "lapsed", hasAccess: false, reason: "unpaid" };
    if (subscription) return { kind: "lapsed", hasAccess: false, reason: "canceled" };
    return { kind: "lapsed", hasAccess: false, reason: "trial_ended" };
}
