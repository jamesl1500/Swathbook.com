import { expect, test } from "@playwright/test";
import { addDays } from "../src/libs/time";
import { admin, createBusiness, createUser } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { uniqueEmail, uniqueId } from "./support/data";
import { chicagoDateKey } from "./support/time";

test.describe("notifications", () => {
    test("the owner hears about a new booking live, opens it, and catches up", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { openEveryDay: true });
        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");
        const bell = page.getByRole("button", { name: /^Notifications/ });
        await expect(bell).toHaveAccessibleName("Notifications");

        // A customer books while the owner is looking at the dashboard.
        const { data: service } = await admin.from("services").select("id").eq("business_id", business.id).limit(1).single();
        const customer = `Nia ${uniqueId()}`;
        const { data: booked, error } = await admin.rpc("create_booking", {
            p_business_id: business.id,
            p_service_ids: [service!.id],
            p_start: new Date(`${addDays(chicagoDateKey(new Date()), 3)}T16:00:00Z`).toISOString(),
            p_customer: { full_name: customer, email: uniqueEmail("nia") },
            p_address: { line1: "1 Elm St" },
        });
        if (error) throw error;

        // No reload: it arrives over Realtime.
        await expect(bell).toHaveAccessibleName("Notifications, 1 unread", { timeout: 15_000 });
        await expect(page.getByText(`New booking: ${customer}`).first()).toBeVisible();

        await bell.click();
        const panel = page.getByRole("dialog", { name: "Notifications" });
        await panel.getByRole("link", { name: new RegExp(`New booking: ${customer}`) }).click();
        await expectOnPath(page, `/dashboard/schedule/${booked![0].booking_id}`);

        // Caught up, and it stays that way after a reload.
        await page.reload();
        await expect(page.getByRole("button", { name: /^Notifications/ })).toHaveAccessibleName("Notifications");
    });

    test("owners don't get notified about their own changes", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { openEveryDay: true });
        await logIn(page, owner.email, owner.password);
        await expectOnPath(page, "/dashboard");

        // The owner adds a job themselves (as their own session would).
        const { data: customerRow } = await admin.from("customers").insert({ business_id: business.id, full_name: "Self Made" }).select("id").single();
        const { data: event } = await admin
            .from("bookings")
            .insert({
                business_id: business.id,
                customer_id: customerRow!.id,
                status: "confirmed",
                scheduled_start: new Date(Date.now() + 2 * 86_400_000).toISOString(),
                scheduled_end: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
            })
            .select("id")
            .single();
        await admin.from("booking_events").update({ actor_id: owner.id }).eq("booking_id", event!.id);

        await page.reload();
        await expect(page.getByRole("button", { name: /^Notifications/ })).toHaveAccessibleName("Notifications");
    });
});
