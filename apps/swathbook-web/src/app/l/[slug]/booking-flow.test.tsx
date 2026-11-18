import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicService } from "@/libs/booking-page";

const state = vi.hoisted(() => ({ push: vi.fn(), getAvailability: vi.fn(), submitBooking: vi.fn(), locateAddress: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("./actions", () => ({ getAvailability: state.getAvailability, submitBooking: state.submitBooking, locateAddress: state.locateAddress }));
vi.mock("@/app/actions/address", () => ({ suggestAddresses: vi.fn(async () => []), resolveAddress: vi.fn(async () => null) }));
vi.mock("@/components/booking/payment-form", () => ({
    PaymentForm: ({ amountLabel, returnUrl }: { amountLabel: string; returnUrl: string }) => (
        <p data-testid="payment-form">
            Pay {amountLabel} then return to {returnUrl}
        </p>
    ),
}));

import { BookingFlow } from "./booking-flow";

function service(fields: Partial<PublicService> & Pick<PublicService, "id" | "name">): PublicService {
    return {
        description: null,
        price_type: "fixed",
        price_cents: 0,
        duration_minutes: 30,
        deposit_cents: 0,
        deposit_type: "none",
        deposit_percent: 0,
        deposit_amount_cents: 0,
        price_per_1000_sqft_cents: null,
        minutes_per_1000_sqft: null,
        questions: [],
        ...fields,
    };
}

const MOW = service({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Lawn mowing",
    description: "Front and back",
    price_cents: 4_500,
    duration_minutes: 45,
    deposit_cents: 1_000,
    deposit_type: "fixed",
    deposit_amount_cents: 1_000,
});
const QUOTE = service({ id: "22222222-2222-4222-8222-222222222222", name: "Tree removal", price_type: "quote", duration_minutes: 120 });
const EDGE = service({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Edging",
    price_type: "starting_at",
    price_cents: 2_000,
    deposit_cents: 500,
    deposit_type: "fixed",
    deposit_amount_cents: 500,
});
// Priced by area: $8 per 1,000 sq ft, never under $40, with a 25% deposit.
const AERATE = service({
    id: "55555555-5555-4555-8555-555555555555",
    name: "Aeration",
    price_type: "starting_at",
    price_cents: 4_000,
    deposit_cents: 1_000,
    deposit_type: "percent",
    deposit_percent: 25,
    price_per_1000_sqft_cents: 800,
});

// 9:00 and 10:30 on Tue Nov 10 2026 in Chicago (UTC-6).
const SLOTS = [
    { start: "2026-11-10T15:00:00.000Z", end: "2026-11-10T15:45:00.000Z", neighborDiscountPercent: 0 },
    { start: "2026-11-10T16:30:00.000Z", end: "2026-11-10T17:15:00.000Z", neighborDiscountPercent: 0 },
];

function setup(props: Partial<Parameters<typeof BookingFlow>[0]> = {}) {
    const user = userEvent.setup();
    render(
        <BookingFlow
            slug="green-acres"
            services={[MOW, QUOTE, EDGE]}
            timeZone="America/Chicago"
            currency="usd"
            brandColor="#1c3d70"
            acceptsPayments
            googleEnabled={false}
            startDate="2026-11-09"
            {...props}
        />,
    );
    const next = () => user.click(screen.getByRole("button", { name: /continue/i }));
    return { user, next };
}

type User = ReturnType<typeof userEvent.setup>;

/** Picks services and gives an address, landing on the next step (Measure or Time). */
async function toWhereDone(user: User, next: () => Promise<void>, services: string[] = ["Lawn mowing"]) {
    for (const name of services) await user.click(screen.getByRole("checkbox", { name: new RegExp(name) }));
    await next();
    await screen.findByRole("heading", { name: "Where should we come?" });
    await user.type(screen.getByLabelText("Street address"), "1 Main St");
    await next();
}

async function toTime(user: User, next: () => Promise<void>, services?: string[]) {
    await toWhereDone(user, next, services);
    await screen.findByRole("heading", { name: "Pick a time" });
}

async function toDetails(user: User, next: () => Promise<void>, services?: string[]) {
    await toTime(user, next, services);
    await user.click(await screen.findByRole("button", { name: "9:00 AM" }));
    await next();
    await screen.findByRole("heading", { name: "Your details" });
}

async function fillDetails(user: User) {
    await user.type(screen.getByLabelText("Your name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
}

beforeEach(() => {
    state.push.mockReset();
    state.getAvailability.mockReset().mockResolvedValue({ slots: SLOTS });
    state.submitBooking.mockReset().mockResolvedValue({ ok: true, token: "t".repeat(64) });
    state.locateAddress.mockReset().mockResolvedValue({ ok: true, location: { lat: 30.27, lng: -97.74 }, locationToken: "signed-spot", satellite: null });
});

describe("BookingFlow", () => {
    it("says so when nothing is bookable online", () => {
        setup({ services: [] });
        expect(screen.getByRole("heading", { name: "No services are bookable online yet" })).toBeInTheDocument();
    });

    it("shows each price style and deposits only when the business takes payments", () => {
        setup();
        expect(screen.getByText("$45")).toBeInTheDocument();
        expect(screen.getByText("Quote")).toBeInTheDocument();
        expect(screen.getByText("From $20")).toBeInTheDocument();
        expect(screen.getByText(/\$10 deposit to book/)).toBeInTheDocument();
    });

    it("hides deposits when online payments are off", () => {
        setup({ acceptsPayments: false });
        expect(screen.queryByText(/deposit to book/)).not.toBeInTheDocument();
    });

    it("won't continue without a service, then totals what's picked", async () => {
        const { user } = setup();
        expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
        expect(screen.getByText("Pick a service to continue")).toBeInTheDocument();

        await user.click(screen.getByRole("checkbox", { name: /Lawn mowing/ }));
        await user.click(screen.getByRole("checkbox", { name: /Tree removal/ }));
        expect(screen.getByText(/2 selected/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    });

    it("loads open times for the picked services and opens on the first day with any", async () => {
        const { user, next } = setup();
        await toTime(user, next);

        expect(await screen.findByRole("button", { name: "9:00 AM" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "10:30 AM" })).toBeInTheDocument();
        expect(state.getAvailability).toHaveBeenCalledWith({
            slug: "green-acres",
            serviceIds: [MOW.id],
            from: "2026-11-09",
            days: 7,
            locationToken: "signed-spot",
        });
        expect(state.locateAddress).toHaveBeenCalledWith({ slug: "green-acres", address: expect.objectContaining({ line1: "1 Main St" }), wantsMap: false });

        const days = within(screen.getByRole("tablist", { name: "Days" })).getAllByRole("tab");
        expect(days).toHaveLength(7);
        // Only Tuesday the 10th has times.
        expect(days.filter((day) => !(day as HTMLButtonElement).disabled)).toHaveLength(1);
        expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("10");
        // Can't page back before today.
        expect(screen.getByRole("button", { name: /earlier/i })).toBeDisabled();
    });

    it("pages to later weeks", async () => {
        const { user, next } = setup();
        await toTime(user, next);
        await screen.findByRole("button", { name: "9:00 AM" });

        state.getAvailability.mockResolvedValue({ slots: [] });
        await user.click(screen.getByRole("button", { name: /later/i }));
        await waitFor(() => expect(state.getAvailability).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-11-16" })));
        expect(await screen.findByText("No open times this week. Try later dates.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /earlier/i })).toBeEnabled();
    });

    it("shows availability errors", async () => {
        state.getAvailability.mockResolvedValue({ error: "This business isn't taking bookings right now." });
        const { user, next } = setup();
        await toTime(user, next);
        expect(await screen.findByText("This business isn't taking bookings right now.")).toBeInTheDocument();
    });

    it("books without a deposit and goes to the customer's booking page", async () => {
        const { user, next } = setup({ acceptsPayments: false });
        await toDetails(user, next);
        await fillDetails(user);
        await user.click(screen.getByRole("button", { name: "Book it" }));

        await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/booking/${"t".repeat(64)}`));
        expect(state.submitBooking).toHaveBeenCalledWith({
            slug: "green-acres",
            serviceIds: [MOW.id],
            start: SLOTS[0].start,
            customer: { fullName: "Ada Lovelace", email: "ada@example.com", phone: "" },
            address: expect.objectContaining({ line1: "1 Main St" }),
            notes: "",
            answers: [],
            measurement: null,
            company: "",
        });
    });

    describe("questions about the job", () => {
        const DETAIL = service({
            id: "44444444-4444-4444-8444-444444444444",
            name: "Full detail",
            price_cents: 18_000,
            duration_minutes: 60,
            questions: [
                { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", prompt: "Make and model?", kind: "text", options: [], required: true },
                { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", prompt: "What kind of car?", kind: "choice", options: ["Sedan", "SUV", "Truck"], required: true },
                { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", prompt: "Anything to avoid?", kind: "text", options: [], required: false },
            ],
        });

        it("asks the chosen service's questions and won't book until required ones are answered", async () => {
            const { user, next } = setup({ services: [DETAIL, MOW], acceptsPayments: false });
            await toDetails(user, next, ["Full detail"]);
            await fillDetails(user);

            const questions = screen.getByTestId("booking-questions");
            expect(within(questions).getByLabelText("Make and model?")).toBeInTheDocument();
            expect(within(questions).getByRole("group", { name: "What kind of car?" })).toBeInTheDocument();
            expect(within(questions).getByLabelText(/Anything to avoid\?/)).not.toBeRequired();

            await user.click(screen.getByRole("button", { name: "Book it" }));
            expect(state.submitBooking).not.toHaveBeenCalled();
            expect(within(questions).getByText("Please answer this.")).toBeInTheDocument();
            expect(within(questions).getByText("Pick one.")).toBeInTheDocument();
            expect(within(questions).getByLabelText("Make and model?")).toHaveFocus();

            await user.type(within(questions).getByLabelText("Make and model?"), "Honda Civic");
            await user.click(within(questions).getByRole("radio", { name: "SUV" }));
            expect(within(questions).queryByText("Pick one.")).not.toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Book it" }));

            await waitFor(() => expect(state.submitBooking).toHaveBeenCalledTimes(1));
            expect(state.submitBooking.mock.calls[0][0].answers).toEqual([
                { questionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", answer: "Honda Civic" },
                { questionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", answer: "SUV" },
            ]);
        });

        it("doesn't ask anything for services without questions", async () => {
            const { user, next } = setup({ services: [DETAIL, MOW], acceptsPayments: false });
            await toDetails(user, next, ["Lawn mowing"]);
            expect(screen.queryByTestId("booking-questions")).not.toBeInTheDocument();
        });
    });

    it("adds up deposits and moves on to paying one", async () => {
        state.submitBooking.mockResolvedValue({ ok: true, token: "p".repeat(64), payment: { clientSecret: "cs", stripeAccountId: "acct_1", amountCents: 1_500 } });
        const { user, next } = setup();
        await toDetails(user, next, ["Lawn mowing", "Edging"]);

        expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Details");
        expect(screen.getByText("Deposit")).toBeInTheDocument();
        expect(screen.getByText("Deposit due now").nextSibling).toHaveTextContent("$15");

        await fillDetails(user);
        await user.click(screen.getByRole("button", { name: "Continue to deposit" }));
        expect(await screen.findByRole("heading", { name: "Pay your deposit" })).toBeInTheDocument();
        expect(screen.getByTestId("payment-form")).toHaveTextContent(`Pay $15 then return to ${window.location.origin}/booking/${"p".repeat(64)}?paid=1`);
        expect(state.push).not.toHaveBeenCalled();
    });

    it("shows the server's field errors next to the fields", async () => {
        state.submitBooking.mockResolvedValue({
            ok: false,
            error: "Check the highlighted fields.",
            fieldErrors: { "customer.email": ["Enter a valid email address."] },
        });
        const { user, next } = setup({ acceptsPayments: false });
        await toDetails(user, next);
        await user.click(screen.getByRole("button", { name: "Book it" }));

        expect(await screen.findByText("Check the highlighted fields.")).toBeInTheDocument();
        expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    });

    it("sends the customer back to pick another time when theirs was just taken", async () => {
        const { user, next } = setup({ acceptsPayments: false });
        await toDetails(user, next);
        await fillDetails(user);

        state.submitBooking.mockResolvedValue({ ok: false, code: "slot_unavailable", error: "Someone just booked that time. Pick another." });
        state.getAvailability.mockResolvedValue({ slots: [SLOTS[1]] });
        await user.click(screen.getByRole("button", { name: "Book it" }));

        expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "10:30 AM" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "9:00 AM" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    });

    it("keeps the honeypot out of the accessibility tree", async () => {
        const { user, next } = setup({ acceptsPayments: false });
        await toDetails(user, next);
        expect(screen.queryByRole("textbox", { name: "Company" })).not.toBeInTheDocument();
    });
    it("says right away when the address is outside the service area", async () => {
        state.locateAddress.mockResolvedValue({ ok: false, error: "That address is outside this business's service area." });
        const { user, next } = setup();
        await toWhereDone(user, next);
        expect(await screen.findByText("That address is outside this business's service area.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Where should we come?" })).toBeInTheDocument();
        expect(state.getAvailability).not.toHaveBeenCalled();
    });

    describe("neighbor pricing", () => {
        const NEIGHBOR_SLOTS = [
            { start: "2026-11-10T15:00:00.000Z", end: "2026-11-10T15:45:00.000Z", neighborDiscountPercent: 10 },
            { start: "2026-11-11T15:00:00.000Z", end: "2026-11-11T15:45:00.000Z", neighborDiscountPercent: 0 },
        ];

        it("tells the customer it's offered before they give their address", async () => {
            const { user, next } = setup({ neighborDiscountPercent: 10 });
            await user.click(screen.getByRole("checkbox", { name: /Lawn mowing/ }));
            await next();
            expect(await screen.findByText(/book a day we're already working near you and save 10%/)).toBeInTheDocument();
        });

        it("flags days with nearby work, opens on one, and takes the discount off", async () => {
            state.getAvailability.mockResolvedValue({ slots: NEIGHBOR_SLOTS });
            const { user, next } = setup({ neighborDiscountPercent: 10, acceptsPayments: false });
            await toTime(user, next);

            expect(await screen.findByTestId("neighbor-banner")).toHaveTextContent("We're already working near you on Tue, Nov 10");
            expect(screen.getByRole("tab", { name: "Tue, Nov 10, save 10%" })).toHaveAttribute("aria-selected", "true");

            await user.click(screen.getByRole("button", { name: "9:00 AM" }));
            expect(screen.getByText(/· 10% off/)).toBeInTheDocument();
            await next();
            expect(await screen.findByTestId("neighbor-discount")).toHaveTextContent("Neighbor discount (10%)−$4.50");
        });

        it("doesn't mention it when no day nearby is open", async () => {
            const { user, next } = setup({ neighborDiscountPercent: 10 });
            await toTime(user, next);
            await screen.findByRole("button", { name: "9:00 AM" });
            expect(screen.queryByTestId("neighbor-banner")).not.toBeInTheDocument();
        });
    });

    describe("services priced by area", () => {
        it("asks for the size, prices it instantly, and sends it with the booking", async () => {
            const { user, next } = setup({ services: [AERATE] });
            await toWhereDone(user, next, ["Aeration"]);
            expect(state.locateAddress).toHaveBeenCalledWith(expect.objectContaining({ wantsMap: true }));
            expect(await screen.findByRole("heading", { name: "Outline the area" })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

            // No satellite photo (Google off, say), so the customer types the size.
            await user.type(screen.getByLabelText("Area in square feet"), "12,500");
            expect(screen.getByText("12,500 sq ft", { selector: "dd" })).toBeInTheDocument();
            expect(screen.getByText("$100")).toBeInTheDocument();
            await next();

            await screen.findByRole("heading", { name: "Pick a time" });
            await waitFor(() => expect(state.getAvailability).toHaveBeenLastCalledWith(expect.objectContaining({ areaSqft: 12_500 })));
            await user.click(await screen.findByRole("button", { name: "9:00 AM" }));
            await next();

            // 25% of $100.
            expect(screen.getByText("Deposit due now").nextSibling).toHaveTextContent("$25");
            await fillDetails(user);
            await user.click(screen.getByRole("button", { name: "Continue to deposit" }));
            await waitFor(() => expect(state.submitBooking).toHaveBeenCalledWith(expect.objectContaining({ measurement: { areaSqft: 12_500 } })));
        });

        it("lets the customer skip measuring and books at the starting price", async () => {
            const { user, next } = setup({ services: [AERATE], acceptsPayments: false });
            await toWhereDone(user, next, ["Aeration"]);
            await user.click(await screen.findByRole("button", { name: "Skip, price it on site" }));
            await user.click(await screen.findByRole("button", { name: "9:00 AM" }));
            await next();
            expect(screen.getByText("From $40")).toBeInTheDocument();
            await fillDetails(user);
            await user.click(screen.getByRole("button", { name: "Book it" }));
            await waitFor(() => expect(state.submitBooking).toHaveBeenCalledWith(expect.objectContaining({ measurement: null })));
        });

        it("goes back to measuring when the server can't use the measurement", async () => {
            state.submitBooking.mockResolvedValue({ ok: false, code: "invalid_measurement", error: "Outline the area at your address." });
            const { user, next } = setup({ services: [AERATE], acceptsPayments: false });
            await toWhereDone(user, next, ["Aeration"]);
            await user.type(await screen.findByLabelText("Area in square feet"), "5000");
            await next();
            await user.click(await screen.findByRole("button", { name: "9:00 AM" }));
            await next();
            await fillDetails(user);
            await user.click(screen.getByRole("button", { name: "Book it" }));
            expect(await screen.findByRole("heading", { name: "Outline the area" })).toBeInTheDocument();
            expect(screen.getAllByText("Outline the area at your address.").length).toBeGreaterThan(0);
        });
    });
});
