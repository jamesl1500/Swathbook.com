import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));

import { PAYMENT_POLL_LIMIT_MS, PAYMENT_POLL_MS, PaymentWatcher } from "./payment-watcher";

beforeEach(() => {
    vi.useFakeTimers();
    state.refresh.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("PaymentWatcher", () => {
    it("refreshes the page while the payment is being confirmed", () => {
        render(<PaymentWatcher active />);
        expect(screen.getByText("Checking for confirmation…")).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(PAYMENT_POLL_MS * 3));
        expect(state.refresh).toHaveBeenCalledTimes(3);
    });

    it("stops once the payment has settled", () => {
        const { rerender } = render(<PaymentWatcher active />);
        act(() => vi.advanceTimersByTime(PAYMENT_POLL_MS));
        rerender(<PaymentWatcher active={false} />);
        act(() => vi.advanceTimersByTime(PAYMENT_POLL_MS * 5));
        expect(state.refresh).toHaveBeenCalledTimes(1);
        expect(screen.queryByText("Checking for confirmation…")).not.toBeInTheDocument();
    });

    it("gives up after a while, and lets the customer check again", () => {
        render(<PaymentWatcher active />);
        act(() => vi.advanceTimersByTime(PAYMENT_POLL_LIMIT_MS + PAYMENT_POLL_MS));
        const calls = state.refresh.mock.calls.length;
        expect(screen.getByText(/taking longer than usual/)).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(PAYMENT_POLL_MS * 5));
        expect(state.refresh).toHaveBeenCalledTimes(calls);

        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        expect(screen.getByText("Checking for confirmation…")).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(PAYMENT_POLL_MS * 2));
        expect(state.refresh.mock.calls.length).toBeGreaterThanOrEqual(calls + 3);
    });

    it("takes Stripe's client secret out of the address bar", () => {
        window.history.replaceState(null, "", "/booking/abc?paid=1&payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_x&redirect_status=succeeded");
        render(<PaymentWatcher active={false} />);
        expect(window.location.search).toBe("?paid=1&payment_intent=pi_123&redirect_status=succeeded");
    });
});
