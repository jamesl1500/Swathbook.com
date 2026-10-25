"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_BUSINESS_COOKIE, activeBusinessCookieOptions } from "@/libs/active-business";
import type { FormState } from "@/libs/forms";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";

/** Joins a team from the invites listed on onboarding (verified email must match). */
export async function joinInvitedBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
    const invitationId = z.uuid().safeParse(formData.get("invitationId"));
    if (!invitationId.success) return { error: "That invite no longer exists." };

    const supabase = await createClient();
    const { data: businessId, error } = await supabase.rpc("accept_invitation", { p_invitation_id: invitationId.data });
    if (error || !businessId) {
        if (error?.message.includes("seat_limit")) return { error: "This team is full on its current plan. Ask the owner to upgrade, then try again." };
        return { error: "This invite has expired or was canceled. Ask for a new one." };
    }

    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, activeBusinessCookieOptions);
    redirect(routes.dashboard);
}
