/**
 * load.ts
 *
 * Reads a business's billing state for the dashboard (owners and admins only:
 * subscriptions are readable to managers through RLS).
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
