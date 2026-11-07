import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicService } from "@/libs/booking-page";

const state = vi.hoisted(() => ({ push: vi.fn(), getAvailability: vi.fn(), submitBooking: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("./actions", () => ({ getAvailability: state.getAvailability, submitBooking: state.submitBooking }));
vi.mock("@/app/actions/address", () => ({ suggestAddresses: vi.fn(async () => []), resolveAddress: vi.fn(async () => null) }));
vi.mock("@/components/booking/payment-form", () => ({
    PaymentForm: ({ amountLabel, returnUrl }: { amountLabel: string; returnUrl: string }) => (
        <p data-testid="payment-form">
            Pay {amountLabel} then return to {returnUrl}
        </p>
    ),
}));

import { BookingFlow } from "./booking-flow";

const MOW: PublicService = { id: "11111111-1111-4111-8111-111111111111", name: "Lawn mowing", description: "Front and back", price_type: "fixed", price_cents: 4_500, duration_minutes: 45, deposit_cents: 1_000 };
const QUOTE: PublicService = { id: "22222222-2222-4222-8222-222222222222", name: "Tree removal", description: null, price_type: "quote", price_cents: 0, duration_minutes: 120, deposit_cents: 0 };
const EDGE: PublicService = { id: "33333333-3333-4333-8333-333333333333", name: "Edging", description: null, price_type: "starting_at", price_cents: 2_000, duration_minutes: 30, deposit_cents: 500 };

// 9:00 and 10:30 on Tue Nov 10 2026 in Chicago (UTC-6).
const SLOTS = [
    { start: "2026-11-10T15:00:00.000Z", end: "2026-11-10T15:45:00.000Z" },
    { start: "2026-11-10T16:30:00.000Z", end: "2026-11-10T17:15:00.000Z" },
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

async function toDetails(user: ReturnType<typeof userEvent.setup>, next: () => Promise<void>, services: string[] = ["Lawn mowing"]) {
    for (const name of services) await user.click(screen.getByRole("checkbox", { name: new RegExp(name) }));
    await next();
    await user.click(await screen.findByRole("button", { name: "9:00 AM" }));
    await next();
    await screen.findByRole("heading", { name: "Where should we come?" });
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Your name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Street address"), "1 Main St");
}

beforeEach(() => {
    state.push.mockReset();
    state.getAvailability.mockReset().mockResolvedValue({ slots: SLOTS });
    state.submitBooking.mockReset().mockResolvedValue({ ok: true, token: "t".repeat(64) });
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
        await user.click(screen.getByRole("checkbox", { name: /Lawn mowing/ }));
        await next();

        expect(await screen.findByRole("button", { name: "9:00 AM" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "10:30 AM" })).toBeInTheDocument();
        expect(state.getAvailability).toHaveBeenCalledWith({ slug: "green-acres", serviceIds: [MOW.id], from: "2026-11-09", days: 7 });

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
        await user.click(screen.getByRole("checkbox", { name: /Lawn mowing/ }));
        await next();
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
        await user.click(screen.getByRole("checkbox", { name: /Lawn mowing/ }));
        await next();
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
            company: "",
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
            fieldErrors: { "customer.email": ["Enter a valid email address."], "address.line1": ["Enter a street address."] },
        });
        const { user, next } = setup({ acceptsPayments: false });
        await toDetails(user, next);
        await user.click(screen.getByRole("button", { name: "Book it" }));

        expect(await screen.findByText("Check the highlighted fields.")).toBeInTheDocument();
        expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
        expect(screen.getByText("Enter a street address.")).toBeInTheDocument();
    });

    it("sends the customer back to pick another time when theirs was just taken", async () => {
        const { user, next } = setup({ acceptsPayments: false });
        await toDetails(user, next);
        await fillDetails(user);

        state.submitBooking.mockResolvedValue({ ok: false, error: "Someone just booked that time. Pick another." });
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
});
