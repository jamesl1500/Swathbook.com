/**
 * auth.ts
 *
 * Data Access Layer for the signed-in user. Every server-side check of "who is
 * this?" and "which businesses can they use?" goes through here, so
 * authorization stays in one place.
 *
 * @module src/libs/auth
 * @since 1.0.0
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE } from "./active-business";
import { routes } from "./routes";
import { createClient } from "./supabase/server";

export type CurrentUser = {
    id: string;
    email: string;
    fullName: string;
    /** Booking link the user asked for at signup, if any. */
    desiredSlug: string;
};

export type MemberRole = "owner" | "admin" | "crew";

export type BusinessSummary = {
    id: string;
    name: string;
    slug: string;
    trade: string;
    onboarding_completed_at: string | null;
    created_at: string;
    role: MemberRole;
};

/**
 * Returns the verified user, or null when signed out. Uses getClaims(), which
 * validates the JWT rather than trusting the cookie.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;

    const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
    return {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : "",
        fullName: typeof metadata.full_name === "string" ? metadata.full_name : "",
        desiredSlug: typeof metadata.desired_slug === "string" ? metadata.desired_slug : "",
    };
}

/**
 * Like getCurrentUser(), but sends signed-out visitors to the login page.
 */
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
    const user = await getCurrentUser();
    if (!user) {
        redirect(nextPath ? `${routes.login}?next=${encodeURIComponent(nextPath)}` : routes.login);
    }
    return user;
}

/**
 * Every business the user belongs to (owned or as a team member), oldest first.
 */
export async function listMyBusinesses(userId: string): Promise<BusinessSummary[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("business_members")
        .select("role, business:businesses!inner(id, name, slug, trade, onboarding_completed_at, created_at)")
        .eq("user_id", userId)
        .eq("status", "active");

    return (data ?? [])
        .map((row) => ({ ...row.business, role: row.role }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Picks which business the dashboard shows: the remembered one if it's still
 * live and accessible, otherwise the first live business.
 */
export function pickActiveBusiness(businesses: BusinessSummary[], preferredId?: string | null) {
    const live = businesses.filter((business) => business.onboarding_completed_at);
    return live.find((business) => business.id === preferredId) ?? live[0] ?? null;
}

export async function getActiveBusiness(userId: string) {
    const [businesses, cookieStore] = await Promise.all([listMyBusinesses(userId), cookies()]);
    const active = pickActiveBusiness(businesses, cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value);
    return { businesses, active };
}

/**
 * The most recent business this user owns but hasn't finished setting up, so
 * onboarding resumes it instead of creating a duplicate.
 */
export async function getDraftBusiness(userId: string) {
    const supabase = await createClient();
    const { data } = await supabase
        .from("businesses")
        .select("id, name, slug, trade")
        .eq("owner_id", userId)
        .is("onboarding_completed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; name: string; slug: string; trade: string }>();
    return data;
}

/**
 * Where to send someone right after they authenticate: the dashboard once any
 * of their businesses is live, onboarding until then.
 */
export async function getPostAuthPath(userId: string) {
    const businesses = await listMyBusinesses(userId);
    return businesses.some((business) => business.onboarding_completed_at) ? routes.dashboard : routes.onboarding;
}
