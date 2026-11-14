/**
 * customer-account.ts
 *
 * Deleting a customer's login, shared by the app (DELETE /api/app/account)
 * and the website (/my/profile). Their bookings stay: those are the
 * businesses' records. People who run or work for a business delete from the
 * dashboard instead, where ownership can be handed over first.
 *
 * @module src/libs/customer-account
 * @since 1.0.0
 */

import { createAdminClient } from "./supabase/admin";
import { removeAvatarFiles } from "./supabase/storage-cleanup";

export type DeleteCustomerResult = { deleted: true } | { deleted: false; reason: "has_business" | "failed" };

export async function deleteCustomerLogin(userId: string): Promise<DeleteCustomerResult> {
    const admin = createAdminClient();
    const [members, businesses] = await Promise.all([
        admin.from("business_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
        // Owners always have a membership too; this also covers a half-finished signup.
        admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    ]);
    // Fail closed: if we can't tell whether they run a business, don't delete
    // anything (deleting an owner's login would take their business with it).
    if (members.error || businesses.error || members.count === null || businesses.count === null) {
        console.error("[account] customer deletion check failed", members.error ?? businesses.error);
        return { deleted: false, reason: "failed" };
    }
    if (members.count > 0 || businesses.count > 0) return { deleted: false, reason: "has_business" };

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
        console.error("[account] customer deletion failed", error);
        return { deleted: false, reason: "failed" };
    }
    // Their profile photos aren't tied to the login by any cascade.
    await removeAvatarFiles(admin, userId);
    return { deleted: true };
}
