import { expect, test, type Page } from "@playwright/test";
import { addJob, admin, createBusiness, createUser, memberIdFor, runCron } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { PASSWORD, uniqueEmail } from "./support/data";
import { getAuthLink, linkIn, waitForEmail } from "./support/mail";
import { tomorrowAt } from "./support/time";

async function ownerSignedIn(page: Page, options: Parameters<typeof createBusiness>[1] = {}) {
    const owner = await createUser({ fullName: "Olive Owner" });
    const business = await createBusiness(owner.id, { name: "Shine On Detailing", openEveryDay: true, ...options });
    await logIn(page, owner.email, owner.password);
    await expectOnPath(page, "/dashboard");
    return { owner, business };
}

test.describe("booking emails", () => {
    test("a booking emails the customer a confirmation and tells the owner", async ({ page }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, { name: "Bright Nest Cleaning", openEveryDay: true });
        const customerEmail = uniqueEmail("customer");

        await page.goto(`/l/${business.slug}`);
        await page.getByRole("checkbox", { name: /Weekly mow/ }).check();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: /^\d{1,2}:\d{2} [AP]M$/ }).first().click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByLabel("Your name").fill("Pat Customer");
        await page.getByLabel("Email").fill(customerEmail);
        await page.getByLabel("Street address").fill("10 Oak Ln");
        await page.getByLabel("City").fill("Austin");
        await page.getByRole("button", { name: "Book it" }).click();
        await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible();
        const bookingPath = new URL(page.url()).pathname;

        const confirmation = await waitForEmail(customerEmail, /You're booked with Bright Nest Cleaning/);
        expect(confirmation.Text).toContain("Weekly mow");
        expect(new URL(linkIn(confirmation, /^\/booking\/[0-9a-f]{64}$/)).pathname).toBe(bookingPath);

        const ownerNotice = await waitForEmail(owner.email, /New booking: Pat Customer/);
        expect(ownerNotice.Text).toContain("Pat Customer booked");
    });
});

test.describe("unpaid deposits", () => {
    test("a held slot nudges the customer, then is released and the customer is told", async ({ page }) => {
        const { business } = await ownerSignedIn(page);
        const { data: service } = await admin
            .from("services")
            .insert({ business_id: business.id, name: "Ceramic coating", price_cents: 65000, duration_minutes: 60, deposit_type: "percent", deposit_percent: 20 })
            .select("id")
            .single();
        await admin.from("stripe_connect_accounts").insert({ business_id: business.id, stripe_account_id: `acct_${business.id.slice(0, 8)}`, charges_enabled: true });
        const customerEmail = uniqueEmail("payer");
        const { data: held } = await admin.rpc("create_booking", {
            p_business_id: business.id,
            p_service_ids: [service!.id],
            p_start: tomorrowAt(14).at.toISOString(),
            p_customer: { full_name: "Pat Payer", email: customerEmail },
            p_address: { line1: "9 Oak Ln", city: "Austin" },
        });
        const booking = held![0];
        expect(booking.status).toBe("pending_payment");

        // Both sides see the hold and when it ends.
        await page.goto(`/booking/${booking.public_token}`);
        await expect(page.getByText(/We're holding this time for you until \d{1,2}:\d{2} [AP]M/)).toBeVisible();
        await page.goto(`/dashboard/schedule/${booking.booking_id}`);
        await expect(page.getByTestId("hold-notice")).toContainText("Waiting for the deposit");

        // Ten minutes in, the customer gets a link to finish paying.
        await admin.from("notifications").update({ scheduled_for: new Date(Date.now() - 1000).toISOString() }).eq("booking_id", booking.booking_id).eq("template", "booking.deposit_reminder");
        await runCron();
        const reminder = await waitForEmail(customerEmail, /Finish booking with Shine On Detailing/);
        expect(reminder.Text).toContain("Pay $130 deposit");

        // Thirty minutes in, the slot is released.
        await admin.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", booking.booking_id);
        expect((await runCron()).released).toBe(1);
        const released = await waitForEmail(customerEmail, /Your hold with Shine On Detailing expired/);
        expect(new URL(linkIn(released, new RegExp(`^/l/${business.slug}$`))).pathname).toBe(`/l/${business.slug}`);

        await page.reload();
        await expect(page.getByTestId("cancel-reason")).toContainText("the deposit wasn't paid within 30 minutes");
    });
});

test.describe("billing", () => {
    test("the trial, a paused page when it ends, and reopening with a plan", async ({ page }) => {
        const { business } = await ownerSignedIn(page);
        await page.goto("/dashboard/billing");
        await expect(page.getByTestId("billing-status")).toContainText("Free trial · 14 days left");
        await expect(page.getByText("Billing isn't configured yet")).toBeVisible();

        // Trial over, no plan: the booking page pauses and the owner is told everywhere.
        await admin.from("businesses").update({ trial_ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", business.id);
        await page.goto("/dashboard");
        await expect(page.getByTestId("billing-banner")).toContainText("Your booking page is paused");
        await page.goto("/dashboard/billing");
        await expect(page.getByTestId("billing-status")).toContainText("Your free trial has ended");
        await page.goto(`/l/${business.slug}`);
        await expect(page.getByRole("heading", { name: /isn't taking online bookings/ })).toBeVisible();

        // A plan (as the Stripe webhook would record it) reopens everything.
        await admin.from("subscriptions").insert({
            business_id: business.id,
            stripe_subscription_id: `sub_${business.id.replace(/-/g, "").slice(0, 14)}`,
            stripe_customer_id: "cus_e2e",
            plan: "crew",
            status: "active",
            current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        });
        await page.goto("/dashboard/billing");
        await expect(page.getByTestId("billing-status")).toContainText("Crew plan is active");
        await expect(page.getByTestId("billing-banner")).toHaveCount(0);
        await expect(page.getByTestId("plan-crew")).toContainText("Current plan");
        await page.goto(`/l/${business.slug}`);
        await expect(page.getByRole("heading", { level: 1, name: "Shine On Detailing" })).toBeVisible();
    });

    test("a nearly finished trial shows a heads-up", async ({ page }) => {
        const { business } = await ownerSignedIn(page);
        await admin.from("businesses").update({ trial_ends_at: new Date(Date.now() + 2 * 86_400_000 - 60_000).toISOString() }).eq("id", business.id);
        await page.goto("/dashboard");
        await expect(page.getByTestId("billing-banner")).toContainText("Your free trial ends in 2 days");
    });
});

test.describe("team", () => {
    test("invite a crew member who signs up from the email, joins, and sees the job", async ({ page, browser }) => {
        const { owner, business } = await ownerSignedIn(page);
        const crewEmail = uniqueEmail("crew");

        await page.goto("/dashboard/team");
        await expect(page.getByTestId("seat-count")).toHaveText("1 of 5 seats");
        await page.getByLabel("Email").fill(crewEmail);
        await page.getByRole("button", { name: "Send invite" }).click();
        await expect(page.getByText(`Invite sent to ${crewEmail}.`)).toBeVisible();
        await expect(page.getByTestId("pending-invite")).toContainText(crewEmail);
        await expect(page.getByTestId("seat-count")).toHaveText("2 of 5 seats");

        const invite = await waitForEmail(crewEmail, /Olive Owner invited you to Shine On Detailing/);
        const inviteUrl = linkIn(invite, /^\/invite\/[0-9a-f]{64}$/);

        // The crew member has no account yet.
        const crewContext = await browser.newContext();
        const crew = await crewContext.newPage();
        await crew.goto(inviteUrl);
        await expect(crew.getByRole("heading", { name: "Join Shine On Detailing" })).toBeVisible();
        await crew.getByRole("link", { name: "Create your account" }).click();
        await expect(crew.getByLabel("Email")).toHaveValue(crewEmail);
        await crew.getByLabel("Your name").fill("Carl Crew");
        await crew.getByLabel("Password").fill(PASSWORD);
        await crew.getByRole("button", { name: "Create account" }).click();
        await expectOnPath(crew, "/auth/verify_email");

        // Confirming the email signs them in; their invite is waiting at the top of setup.
        await crew.goto(await getAuthLink(crewEmail, /Confirm your Swathbook account/));
        await expectOnPath(crew, "/onboarding");
        await expect(crew.getByTestId("pending-invitation")).toContainText("Olive Owner invited you to Shine On Detailing as part of the crew");
        await crew.getByRole("button", { name: "Join Shine On Detailing" }).click();
        await expectOnPath(crew, "/dashboard");

        // The owner assigns a job; the crew member sees it, but not money or settings.
        const crewMember = await memberIdFor(business.id, (await admin.from("business_members").select("user_id").eq("business_id", business.id).eq("role", "crew").single()).data!.user_id);
        await addJob(business.id, { start: tomorrowAt(10).at, memberId: crewMember, customerName: "Crew Customer", lat: 30.2, lng: -97.7 });
        await crew.goto(`/dashboard/schedule?week=${tomorrowAt(10).date}`);
        await expect(crew.getByTestId("calendar-job").filter({ hasText: "Crew Customer" })).toBeVisible();
        await crew.goto("/dashboard/billing");
        await expect(crew.getByRole("heading", { name: "Owners and admins only" })).toBeVisible();
        await crewContext.close();

        await page.reload();
        await expect(page.getByTestId("team-member")).toHaveCount(2);
        await expect(page.getByTestId("team-member").filter({ hasText: "Carl Crew" })).toContainText(crewEmail);
        await expect(page.getByTestId("pending-invite")).toHaveCount(0);

        // Solo is one seat: the team is over its limit, so inviting is blocked.
        await admin.from("subscriptions").insert({
            business_id: business.id,
            stripe_subscription_id: `sub_${business.id.replace(/-/g, "").slice(0, 14)}`,
            stripe_customer_id: "cus_e2e",
            plan: "solo",
            status: "active",
        });
        await page.reload();
        await expect(page.getByText("Your plan's seats are full.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Send invite" })).toBeDisabled();

        // Removing the crew member frees the seat.
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "Remove Carl Crew" }).click();
        await expect(page.getByTestId("team-member")).toHaveCount(1);
        expect(owner.email).toBeTruthy();
    });

    test("someone with an account joins straight from the invite link", async ({ page, browser }) => {
        await ownerSignedIn(page);
        const existing = await createUser({ fullName: "Ada Admin" });
        await page.goto("/dashboard/team");
        await page.getByLabel("Email").fill(existing.email);
        await page.getByLabel("Role").selectOption("admin");
        await page.getByRole("button", { name: "Send invite" }).click();
        const inviteUrl = linkIn(await waitForEmail(existing.email, /invited you to Shine On Detailing/), /^\/invite\//);

        const context = await browser.newContext();
        const invitee = await context.newPage();
        await invitee.goto(inviteUrl);
        await invitee.getByRole("link", { name: "I already have an account" }).click();
        await logIn(invitee, existing.email, existing.password, { next: new URL(inviteUrl).pathname });
        await expect(invitee.getByText("You've been invited as an admin.")).toBeVisible();
        await invitee.getByRole("button", { name: "Join Shine On Detailing" }).click();
        await expectOnPath(invitee, "/dashboard");
        await invitee.goto("/dashboard/services");
        await expect(invitee.getByRole("heading", { level: 1, name: "Services" })).toBeVisible();
        await context.close();
    });

    test("an invite for someone else's email asks them to switch accounts", async ({ page, browser }) => {
        await ownerSignedIn(page);
        await page.goto("/dashboard/team");
        const invited = uniqueEmail("invited");
        await page.getByLabel("Email").fill(invited);
        await page.getByRole("button", { name: "Send invite" }).click();
        const url = await page.getByTestId("invite-url").textContent();

        const other = await createUser({ fullName: "Someone Else" });
        const context = await browser.newContext();
        const stranger = await context.newPage();
        await logIn(stranger, other.email, other.password);
        await expectOnPath(stranger, "/onboarding");
        await stranger.goto(url!);
        await expect(stranger.getByText(`This invite is for ${invited}`)).toBeVisible();
        await expect(stranger.getByRole("button", { name: /Join/ })).toHaveCount(0);
        await context.close();
    });
});
