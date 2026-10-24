"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE, activeBusinessCookieOptions } from "@/libs/active-business";
import { getCurrentUser, listMyBusinesses } from "@/libs/auth";
import { routes } from "@/libs/routes";

/**
 * Switches the dashboard to another business the user belongs to. Unknown or
 * unfinished businesses are ignored rather than trusted.
 */
export async function selectBusiness(formData: FormData) {
    const user = await getCurrentUser();
    if (!user) redirect(routes.login);

    const businessId = formData.get("businessId");
    const businesses = await listMyBusinesses(user.id);
    const target = businesses.find((business) => business.id === businessId && business.onboarding_completed_at);

    if (target) {
        (await cookies()).set(ACTIVE_BUSINESS_COOKIE, target.id, activeBusinessCookieOptions);
    }
    redirect(routes.dashboard);
}
