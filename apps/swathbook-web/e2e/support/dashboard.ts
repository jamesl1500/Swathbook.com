import type { Page } from "@playwright/test";
import { addJob, admin, createBusiness, createUser, memberIdFor } from "./admin";
import { expectOnPath, logIn } from "./auth";
import { tomorrowAt } from "./time";

/**
 * An owner with a business that's open every day and has one job tomorrow,
 * signed in on the dashboard. The trial is nearly over, so the billing
 * banner shows on every page.
 */
export async function signInToBusyDashboard(page: Page, { customerName = "Pat Customer" } = {}) {
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, { name: "Shine On Mobile Detailing", openEveryDay: true });
    const { bookingId, customerId } = await addJob(business.id, {
        start: tomorrowAt(10).at,
        memberId: await memberIdFor(business.id, owner.id),
        customerName,
        lat: 30.2,
        lng: -97.7,
    });
    await admin.from("businesses").update({ trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() }).eq("id", business.id);
    await logIn(page, owner.email, owner.password);
    await expectOnPath(page, "/dashboard");
    return { owner, business, bookingId, customerId };
}

/** Every dashboard page for that business. `tabs` adds the pages' secondary tabs. */
export function dashboardPaths({ bookingId, customerId }: { bookingId: string; customerId: string }, { tabs = false } = {}) {
    const { date } = tomorrowAt(10);
    return [
        "/dashboard",
        `/dashboard/schedule?week=${date}`,
        `/dashboard/schedule/${bookingId}`,
        "/dashboard/schedule/new",
        "/dashboard/schedule/availability",
        ...(tabs ? ["/dashboard/schedule/availability?tab=rules"] : []),
        "/dashboard/customers",
        `/dashboard/customers/${customerId}`,
        "/dashboard/customers/new",
        `/dashboard/routes?date=${date}`,
        "/dashboard/services",
        "/dashboard/link",
        ...(tabs ? ["/dashboard/link?tab=details", "/dashboard/link?tab=photos"] : []),
        "/dashboard/payouts",
        "/dashboard/account",
        "/dashboard/team",
        "/dashboard/bookings",
        "/dashboard/billing",
    ];
}
