/**
 * Shared logic for Stripe's onboarding redirects back into the app. Each link
 * names its business, because the owner may have switched businesses while
 * they were on Stripe.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_BUSINESS_COOKIE, activeBusinessCookieOptions } from "@/libs/active-business";
import { getCurrentUser, listMyBusinesses } from "@/libs/auth";
import { routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createOnboardingLink, retrieveAccountStatus, saveConnectStatus } from "@/libs/stripe/connect";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createAdminClient } from "@/libs/supabase/admin";

/** The business named in the link and its connected account, if the signed-in user owns it. */
async function ownerAccount(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return { redirectTo: `${routes.login}?next=${routes.payouts}` };
    const businessId = request.nextUrl.searchParams.get("business");
    const business = (await listMyBusinesses(user.id)).find((item) => item.id === businessId && item.onboarding_completed_at);
    if (business?.role !== "owner" || !hasStripe()) return { redirectTo: routes.payouts };
    const { data: account } = await createAdminClient()
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("business_id", business.id)
        .maybeSingle();
    return account ? { businessId: business.id, accountId: account.stripe_account_id } : { redirectTo: routes.payouts };
}

/** Back to the payouts page, showing the business that was being set up. */
function backToPayouts(request: NextRequest, businessId: string, query = "") {
    const response = NextResponse.redirect(new URL(`${routes.payouts}${query}`, request.url));
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, businessId, activeBusinessCookieOptions);
    return response;
}

/** return_url: Stripe passes no state of its own, so re-read the account and show the result. */
export async function handleOnboardingReturn(request: NextRequest) {
    const owner = await ownerAccount(request);
    if ("redirectTo" in owner) return NextResponse.redirect(new URL(owner.redirectTo!, request.url));
    try {
        await saveConnectStatus(createAdminClient(), owner.businessId, await retrieveAccountStatus(getStripe(), owner.accountId));
    } catch (error) {
        console.error("[payouts] status refresh on return failed", error);
    }
    return backToPayouts(request, owner.businessId, "?onboarding=returned");
}

/** refresh_url: the link expired or was already used; mint a new one for the same business. */
export async function handleOnboardingRefresh(request: NextRequest) {
    const owner = await ownerAccount(request);
    if ("redirectTo" in owner) return NextResponse.redirect(new URL(owner.redirectTo!, request.url));
    try {
        return NextResponse.redirect(await createOnboardingLink(getStripe(), owner.accountId, owner.businessId, await getSiteUrl()));
    } catch (error) {
        console.error("[payouts] new onboarding link failed", error);
        return backToPayouts(request, owner.businessId);
    }
}
