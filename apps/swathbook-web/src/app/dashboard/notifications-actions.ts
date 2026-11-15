"use server";

import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { EMPTY_FEED, type NotificationFeed } from "@/libs/notifications";
import { createClient } from "@/libs/supabase/server";

/**
 * The signed-in member's notification feed for one business. Runs as them, so
 * my_notifications (and RLS) decide what they hear about.
 */
export async function loadNotifications(businessId: string): Promise<NotificationFeed> {
    const auth = await authorizeBusiness(businessId);
    if (isFailure(auth)) return EMPTY_FEED;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_notifications", { p_business_id: auth.businessId, p_limit: 20 });
    if (error) {
        console.error("[notifications] loading failed", error.code ?? error.message);
        return EMPTY_FEED;
    }
    return (data as NotificationFeed | null) ?? EMPTY_FEED;
}

/** Catch up: everything so far counts as read. */
export async function markNotificationsRead(businessId: string): Promise<{ ok: boolean }> {
    const auth = await authorizeBusiness(businessId);
    if (isFailure(auth)) return { ok: false };
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_notifications_read", { p_business_id: auth.businessId });
    if (error) console.error("[notifications] marking read failed", error.code ?? error.message);
    return { ok: !error };
}
