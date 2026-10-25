"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE, activeBusinessCookieOptions } from "@/libs/active-business";
import type { FormState } from "@/libs/forms";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
    const token = formData.get("token");
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { error: "This invite link isn't valid." };

    const supabase = await createClient();
    const { data: businessId, error } = await supabase.rpc("accept_business_invitation", { p_token: token });
    if (error || !businessId) {
        if (error?.message.includes("seat_limit")) return { error: "This team is full on its current plan. Ask the owner to upgrade, then try again." };
        if (error?.message.includes("not_authenticated")) redirect(`${routes.login}?next=${encodeURIComponent(`/invite/${token}`)}`);
        return { error: "This invite has expired or was already used. Ask for a new one." };
    }

    // Open the dashboard on the business they just joined.
    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, activeBusinessCookieOptions);
    redirect(routes.dashboard);
}
