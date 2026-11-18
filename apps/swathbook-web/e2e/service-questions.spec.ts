import { expect, test } from "@playwright/test";
import { admin, createBusiness, createUser } from "./support/admin";
import { expectOnPath, logIn } from "./support/auth";
import { uniqueEmail, uniqueId } from "./support/data";

test.describe("questions on services", () => {
    test("the owner asks questions, the customer must answer them to book, and the owner sees the answers", async ({ browser }) => {
        const owner = await createUser({ fullName: "Olive Owner" });
        const business = await createBusiness(owner.id, {
            name: `Shine On Detail ${uniqueId()}`,
            openEveryDay: true,
            services: [{ name: "Full detail", price_cents: 18000, duration_minutes: 60 }],
        });

        // The owner adds two questions to the service.
        const ownerPage = await (await browser.newContext()).newPage();
        await logIn(ownerPage, owner.email, owner.password);
        await expectOnPath(ownerPage, "/dashboard");
        await ownerPage.goto("/dashboard/services");
        await ownerPage.getByRole("button", { name: "Edit Full detail" }).click();
        const editor = ownerPage.getByTestId("service-row").filter({ has: ownerPage.getByRole("button", { name: "Save changes" }) });

        await editor.getByRole("button", { name: "Add a question" }).click();
        await editor.getByLabel("Question 1", { exact: true }).fill("Make and model?");
        await editor.getByRole("button", { name: "Add a question" }).click();
        await editor.getByLabel("Question 2", { exact: true }).fill("What kind of car?");
        await editor.getByLabel("Answer type for question 2").selectOption("choice");
        await editor.getByLabel("Option 1 for question 2").fill("Sedan");
        await editor.getByLabel("Option 2 for question 2").fill("SUV");
        await editor.getByRole("button", { name: "Add option" }).click();
        await editor.getByLabel("Option 3 for question 2").fill("Truck");
        await editor.getByRole("button", { name: "Save changes" }).click();
        await expect(ownerPage.getByTestId("service-row").filter({ hasText: "Full detail" })).toContainText("2 questions");

        // A customer books and has to answer them.
        const page = await (await browser.newContext()).newPage();
        const email = uniqueEmail("customer");
        await page.goto(`/l/${business.slug}`);
        await page.getByRole("checkbox", { name: /Full detail/ }).check();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByLabel("Street address").fill("10 Oak Ln");
        await page.getByLabel("City").fill("Austin");
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: /^\d{1,2}:\d{2} [AP]M$/ }).first().click();
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByLabel("Your name").fill("Pat Customer");
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Book it" }).click();

        const questions = page.getByTestId("booking-questions");
        await expect(questions.getByText("Please answer this.")).toBeVisible();
        await expect(questions.getByText("Pick one.")).toBeVisible();
        expect(await admin.from("bookings").select("id", { count: "exact", head: true }).eq("business_id", business.id)).toMatchObject({ count: 0 });

        await questions.getByLabel("Make and model?").fill("Honda Civic");
        await questions.getByText("SUV", { exact: true }).click();
        await page.getByRole("button", { name: "Book it" }).click();

        await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible();
        const answers = page.getByTestId("booking-answers");
        await expect(answers).toContainText("Make and model?");
        await expect(answers).toContainText("Honda Civic");
        await expect(answers).toContainText("SUV");

        // The owner sees what the customer said on the job.
        const { data: booking } = await admin.from("bookings").select("id").eq("business_id", business.id).single();
        await ownerPage.goto(`/dashboard/schedule/${booking!.id}`);
        const card = ownerPage.getByTestId("booking-answers");
        await expect(card).toContainText("What kind of car?");
        await expect(card).toContainText("SUV");
        await expect(card).toContainText("Honda Civic");
    });

    test("the booking page refuses answers that skip a required question, even without the form", async () => {
        const owner = await createUser();
        const business = await createBusiness(owner.id, { openEveryDay: true, services: [{ name: "Full detail", price_cents: 18000, duration_minutes: 60 }] });
        const { data: service } = await admin.from("services").select("id").eq("business_id", business.id).single();
        await admin.from("service_questions").insert({ business_id: business.id, service_id: service!.id, prompt: "Make and model?" });

        // Straight at the database function the server uses, as a hand-crafted request would end up.
        const { error } = await admin.rpc("create_booking", {
            p_business_id: business.id,
            p_service_ids: [service!.id],
            p_start: new Date(Date.now() + 2 * 86_400_000).toISOString(),
            p_customer: { full_name: "Sneaky", email: uniqueEmail("sneaky") },
            p_address: { line1: "1 Elm St" },
        });
        // Checked before the time slot, so any start time shows it.
        expect(error?.message).toBe("answers_required");
    });
});
