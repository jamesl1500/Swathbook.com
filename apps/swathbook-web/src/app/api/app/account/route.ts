import { appError, appJson, appPreflight, authenticateApp } from "@/libs/app-api";
import { deleteCustomerLogin } from "@/libs/customer-account";

/**
 * DELETE /api/app/account: a customer deletes their login (required for apps
 * that let people sign up). See libs/customer-account.ts for the rules.
 */

export function OPTIONS() {
    return appPreflight();
}

export async function DELETE(request: Request) {
    const auth = await authenticateApp(request);
    if ("response" in auth) return auth.response;

    const result = await deleteCustomerLogin(auth.user.id);
    if (result.deleted) return appJson({ deleted: true });
    if (result.reason === "has_business") {
        return appError(409, "has_business", "This login is part of a business on Swathbook. Delete it from your dashboard on the website.");
    }
    return appError(500, "failed", "We couldn't delete your account. Please try again or contact support.");
}
