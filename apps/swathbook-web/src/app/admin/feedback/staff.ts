import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/libs/auth";
import { isStaffEmail } from "@/libs/feedback";
import { routes } from "@/libs/routes";
import { hasAdminClient } from "@/libs/supabase/admin";

/**
 * The feedback inbox is for Swathbook staff only (SWATHBOOK_STAFF_EMAILS).
 * Everyone else gets a plain 404, so the page doesn't advertise itself.
 */
export async function requireStaff() {
    const user = await getCurrentUser();
    if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.feedbackInbox)}`);
    if (!isStaffEmail(user.email) || !hasAdminClient()) notFound();
    return user;
}
