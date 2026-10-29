/**
 * Shared logic for Stripe's onboarding redirects back into the app.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getActiveBusiness, getCurrentUser } from "@/libs/auth";
import { routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createOnboardingLink, retrieveAccountStatus, saveConnectStatus } from "@/libs/stripe/connect";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";

/** The signed-in owner's active business and its connected account, if any. */
async function ownerAccount() {
    const user = await getCurrentUser();
    if (!user) return { redirectTo: `${routes.login}?next=${routes.payouts}` };
    const { active } = await getActiveBusiness(user.id);
    if (!active || active.role !== "owner" || !hasStripe()) return { redirectTo: routes.payouts };
    const { data: account } = await createAdminClient()
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("business_id", active.id)
        .maybeSingle();
    return account ? { businessId: active.id, accountId: account.stripe_account_id } : { redirectTo: routes.payouts };
}

/** return_url: Stripe passes no state, so re-read the account and show the result. */
export async function handleOnboardingReturn(request: NextRequest) {
    const owner = await ownerAccount();
    if ("redirectTo" in owner) return NextResponse.redirect(new URL(owner.redirectTo!, request.url));
    try {
        await saveConnectStatus(createAdminClient(), owner.businessId, await retrieveAccountStatus(getStripe(), owner.accountId));
    } catch (error) {
        console.error("[payouts] status refresh on return failed", error);
    }
    return NextResponse.redirect(new URL(`${routes.payouts}?onboarding=returned`, request.url));
}

/** refresh_url: the link expired or was already used; mint a new one. */
export async function handleOnboardingRefresh(request: NextRequest) {
    const owner = await ownerAccount();
    if ("redirectTo" in owner) return NextResponse.redirect(new URL(owner.redirectTo!, request.url));
    try {
        return NextResponse.redirect(await createOnboardingLink(getStripe(), owner.accountId, await getSiteUrl()));
    } catch (error) {
        console.error("[payouts] new onboarding link failed", error);
        return NextResponse.redirect(new URL(routes.payouts, request.url));
    }
}
