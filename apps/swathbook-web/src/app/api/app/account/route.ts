import { appError, appJson, appPreflight, authenticateApp } from "@/libs/app-api";
import { createAdminClient } from "@/libs/supabase/admin";

/**
 * DELETE /api/app/account: a customer deletes their login (required for apps
 * that let people sign up). Their bookings stay: those are the businesses'
 * records. People who run or work for a business delete from the dashboard,
 * where ownership can be handed over first.
 */

export function OPTIONS() {
    return appPreflight();
}

export async function DELETE(request: Request) {
    const auth = await authenticateApp(request);
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const [{ count: memberships }, { count: owned }] = await Promise.all([
        admin.from("business_members").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id),
        // Owners always have a membership too; this also covers a half-finished signup.
        admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", auth.user.id),
    ]);
    if (memberships || owned) {
        return appError(409, "has_business", "This login is part of a business on Swathbook. Delete it from your dashboard on the website.");
    }

    const { error } = await admin.auth.admin.deleteUser(auth.user.id);
    if (error) {
        console.error("[app] account deletion failed", error);
        return appError(500, "failed", "We couldn't delete your account. Please try again or contact support.");
    }
    return appJson({ deleted: true });
}
