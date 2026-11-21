import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/libs/auth";
import { isStaffEmail } from "@/libs/feedback";
import { routes } from "@/libs/routes";
import { hasAdminClient } from "@/libs/supabase/admin";

/**
 * The staff pages (feedback and investor inboxes) are for Swathbook staff
 * only (SWATHBOOK_STAFF_EMAILS). Everyone else gets a plain 404, so the pages
 * don't advertise themselves.
 */
export async function requireStaff(returnTo: string = routes.feedbackInbox) {
    const user = await getCurrentUser();
    if (!user) redirect(`${routes.login}?next=${encodeURIComponent(returnTo)}`);
    if (!isStaffEmail(user.email) || !hasAdminClient()) notFound();
    return user;
}
