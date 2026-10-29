/**
 * dashboard.ts
 *
 * Who is using the dashboard, for which business, with what role. Pages use
 * requireBusinessContext(); Server Actions use authorizeBusiness(), which
 * re-checks membership for the business id the form was rendered for, so a
 * stale tab can't act on whichever business happens to be active now.
 *
 * Every query still goes through RLS; these checks only make the UI and
 * error messages match what the database will allow.
 *
 * @module src/libs/dashboard
 * @since 1.0.0
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveBusiness, getCurrentUser, listMyBusinesses, requireUser, type CurrentUser, type MemberRole } from "./auth";
import { routes } from "./routes";
import type { Database } from "./supabase/database.types";
import { createClient } from "./supabase/server";

export type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];

export type BusinessContext = {
    user: CurrentUser;
    business: BusinessRow;
    role: MemberRole;
    /** Owners and admins manage services, money and settings; crew work jobs. */
    canManage: boolean;
    memberId: string;
};

export async function requireBusinessContext(nextPath: string = routes.dashboard): Promise<BusinessContext> {
    const user = await requireUser(nextPath);
    const { active } = await getActiveBusiness(user.id);
    if (!active) redirect(routes.onboarding);

    const supabase = await createClient();
    const [{ data: business }, { data: member }] = await Promise.all([
        supabase.from("businesses").select("*").eq("id", active.id).single(),
        supabase.from("business_members").select("id").eq("business_id", active.id).eq("user_id", user.id).single(),
    ]);
    if (!business || !member) redirect(routes.onboarding);

    return { user, business, role: active.role, canManage: active.role !== "crew", memberId: member.id };
}

export type ActionFailure = { error: string };

const businessIdSchema = z.uuid();

/**
 * Confirms the signed-in user belongs to `businessId` (and manages it, if
 * required). Returns the user and role, or an error message for the form.
 */
export async function authorizeBusiness(businessId: unknown, { manage = false }: { manage?: boolean } = {}) {
    const parsedId = businessIdSchema.safeParse(businessId);
    if (!parsedId.success) return { error: "Something went wrong. Refresh the page and try again." } satisfies ActionFailure;

    const user = await getCurrentUser();
    if (!user) return { error: "Your session expired. Log in again to continue." } satisfies ActionFailure;

    const membership = (await listMyBusinesses(user.id)).find((business) => business.id === parsedId.data);
    if (!membership) return { error: "You don't have access to that business." } satisfies ActionFailure;
    if (manage && membership.role === "crew") {
        return { error: "Only owners and admins can change this." } satisfies ActionFailure;
    }
    return { user, role: membership.role, businessId: parsedId.data, business: membership };
}

export function isFailure(value: unknown): value is ActionFailure {
    return typeof value === "object" && value !== null && "error" in value && typeof (value as ActionFailure).error === "string";
}
