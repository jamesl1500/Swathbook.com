import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
    checkSlugAvailability: vi.fn(async () => ({ available: true })),
    completeOnboarding: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { checkSlugAvailability, completeOnboarding } from "./actions";
import { OnboardingWizard, type OnboardingDefaults } from "./onboarding-wizard";

const defaults: OnboardingDefaults = { firstName: "Dana", businessName: "", slug: "" };

function setup(overrides: Partial<OnboardingDefaults> = {}) {
    const user = userEvent.setup();
    render(<OnboardingWizard defaults={{ ...defaults, ...overrides }} />);
    const next = () => user.click(screen.getByRole("button", { name: /continue/i }));
    return { user, next };
}

async function fillBusinessStep(user: ReturnType<typeof userEvent.setup>, name = "Green Acres Lawn") {
    await user.type(screen.getByLabelText("Business name"), name);
    await user.click(screen.getByLabelText("Lawn mowing"));
}

describe("OnboardingWizard", () => {
    it("greets first-time owners by name", () => {
        setup();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hey Dana, let's set up your business");
    });

    it("greets owners adding another business differently", () => {
        setup({ isAdditionalBusiness: true });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Let's add another business");
    });

    it("won't continue until the business step is valid", async () => {
        const { next } = setup();
        await next();

        expect(await screen.findByText("Enter your business name.")).toBeInTheDocument();
        expect(screen.getByText("Pick the kind of work you do.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/set up your business/);
    });

    it("suggests a link from the business name", async () => {
        const { user, next } = setup();
        await fillBusinessStep(user, "Green Acres Lawn & Leaf");
        await next();

        expect(await screen.findByLabelText("Your booking link")).toHaveValue("green-acres-lawn-and-leaf");
    });

    it("keeps a link the owner already claimed at signup", async () => {
        const { user, next } = setup({ slug: "my-claimed-link" });
        await fillBusinessStep(user);
        await next();

        expect(await screen.findByLabelText("Your booking link")).toHaveValue("my-claimed-link");
    });

    it("stops on the link step when the link is taken", async () => {
        vi.mocked(checkSlugAvailability).mockResolvedValueOnce({ available: false, reason: "Someone already has that link. Try another." });
        const { user, next } = setup();
        await fillBusinessStep(user);
        await next();
        await screen.findByLabelText("Your booking link");
        await next();

        expect(await screen.findByText("Someone already has that link. Try another.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pick your booking link");
    });

    it("starts the services step with the chosen trade's starter menu", async () => {
        const { user, next } = setup();
        await fillBusinessStep(user);
        await next();
        await screen.findByLabelText("Your booking link");
        await next();

        await screen.findByRole("heading", { name: "What do you offer?" });
        const names = screen.getAllByLabelText("Service name").map((input) => (input as HTMLInputElement).value);
        expect(names).toEqual(["Weekly mow, edge & blow", "One-time cut", "Overgrown yard reset"]);
    });

    it("shows the business on the live booking-page preview as it's typed", async () => {
        const { user } = setup();
        await user.type(screen.getByLabelText("Business name"), "Shine On Detail");
        const preview = screen.getByRole("complementary", { name: "Booking page preview" });
        expect(within(preview).getByText("Shine On Detail")).toBeInTheDocument();
    });

    it("walks through every step and submits the full setup", async () => {
        const { user, next } = setup();

        await fillBusinessStep(user);
        await user.type(screen.getByLabelText(/Business phone/), "512-555-0100");
        await next();

        await screen.findByLabelText("Your booking link");
        await next();
        await waitFor(() => expect(checkSlugAvailability).toHaveBeenCalledWith("green-acres-lawn"));

        await screen.findByRole("heading", { name: "What do you offer?" });
        const firstPrice = screen.getAllByLabelText("Price in dollars")[0];
        await user.clear(firstPrice);
        await user.type(firstPrice, "50");
        await user.click(screen.getByRole("button", { name: "Remove One-time cut" }));
        await user.click(screen.getByRole("button", { name: /Add a service/ }));
        const names = screen.getAllByLabelText("Service name");
        await user.type(names[names.length - 1], "Gutter clean");
        await next();

        await screen.findByRole("heading", { name: "Where and when do you work?" });
        await user.type(screen.getByLabelText("Where does your day start?"), "1 Main St, Austin");
        await user.click(screen.getByRole("button", { name: "Sat" }));
        await next();

        await screen.findByRole("heading", { name: /Look good/ });
        expect(screen.getByText("swathbook.com/l/green-acres-lawn")).toBeInTheDocument();
        expect(screen.getByText("3 services")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /Launch my booking page/ }));
        await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1));

        expect(vi.mocked(completeOnboarding).mock.calls[0][0]).toEqual({
            businessName: "Green Acres Lawn",
            trade: "lawn-care",
            phone: "512-555-0100",
            slug: "green-acres-lawn",
            services: [
                { name: "Weekly mow, edge & blow", price: 50, durationMinutes: 45, depositPercent: 0 },
                { name: "Overgrown yard reset", price: 150, durationMinutes: 120, depositPercent: 25 },
                { name: "Gutter clean", price: 50, durationMinutes: 60, depositPercent: 20 },
            ],
            baseAddress: "1 Main St, Austin",
            serviceRadiusMiles: 15,
            workDays: [1, 2, 3, 4, 5, 6],
            dayStart: "08:00",
            dayEnd: "17:00",
            timezone: expect.any(String),
        });
    });

    it("sends the owner back to the link step if the link was taken at the last second", async () => {
        vi.mocked(completeOnboarding).mockResolvedValueOnce({ error: "That booking link was just taken. Pick another one.", field: "slug" });
        const { user, next } = setup();

        await fillBusinessStep(user);
        await next();
        await screen.findByLabelText("Your booking link");
        await next();
        await screen.findByRole("heading", { name: "What do you offer?" });
        await next();
        await screen.findByRole("heading", { name: "Where and when do you work?" });
        await user.type(screen.getByLabelText("Where does your day start?"), "1 Main St, Austin");
        await next();
        await user.click(await screen.findByRole("button", { name: /Launch my booking page/ }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That booking link was just taken. Pick another one."));
        expect(await screen.findByRole("heading", { name: "Pick your booking link" })).toBeInTheDocument();
        expect(screen.getByText("That booking link was just taken. Pick another one.")).toBeInTheDocument();
    });
});
