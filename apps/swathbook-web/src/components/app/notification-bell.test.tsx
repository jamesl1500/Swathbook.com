import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationFeed, NotificationItem } from "@/libs/notifications";

const state = vi.hoisted(() => ({
    refresh: vi.fn(),
    push: vi.fn(),
    toast: vi.fn(),
    load: vi.fn(),
    markRead: vi.fn(async () => ({ ok: true })),
    onInsert: null as null | ((payload: { new: Record<string, unknown> }) => void),
    removeChannel: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh, push: state.push }) }));
vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("@/app/dashboard/notifications-actions", () => ({ loadNotifications: state.load, markNotificationsRead: state.markRead }));
vi.mock("@/libs/supabase/client", () => ({
    createClient: () => {
        const channel = {
            on: (_type: string, _filter: unknown, callback: (payload: { new: Record<string, unknown> }) => void) => {
                state.onInsert = callback;
                return channel;
            },
            subscribe: () => channel,
        };
        return { channel: () => channel, removeChannel: state.removeChannel };
    },
}));

import { NotificationBell } from "./notification-bell";

function item(id: string, overrides: Partial<NotificationItem> = {}): NotificationItem {
    return {
        id,
        type: "created",
        from_status: null,
        to_status: "confirmed",
        data: {},
        created_at: new Date().toISOString(),
        booking_id: `b${id}`,
        reference: "AB12",
        scheduled_start: "2026-11-16T15:00:00Z",
        customer_name: `Customer ${id}`,
        unread: true,
        ...overrides,
    };
}

const feed = (unread: number, items: NotificationItem[]): NotificationFeed => ({ unread, items });

function setup(initial = feed(1, [item("1")])) {
    return render(<NotificationBell businessId="biz" userId="me" timeZone="America/Chicago" currency="usd" initial={initial} />);
}

beforeEach(() => {
    state.onInsert = null;
    state.load.mockReset();
});

describe("NotificationBell", () => {
    it("shows the unread count and lists what changed", async () => {
        const user = userEvent.setup();
        setup();
        expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
        expect(screen.getByTestId("notification-count")).toHaveTextContent("1");

        await user.click(screen.getByRole("button", { name: /Notifications/ }));
        const panel = screen.getByRole("dialog", { name: "Notifications" });
        expect(panel).toHaveTextContent("New booking: Customer 1");
        expect(screen.getByRole("link", { name: /New booking: Customer 1/ })).toHaveAttribute("href", "/dashboard/schedule/b1");
    });

    it("catches up when opened", async () => {
        const user = userEvent.setup();
        setup();
        await user.click(screen.getByRole("button", { name: /Notifications/ }));
        expect(state.markRead).toHaveBeenCalledWith("biz");
        expect(screen.queryByTestId("notification-count")).not.toBeInTheDocument();
        expect(screen.getByLabelText("New")).toBeInTheDocument();
    });

    it("says when there's nothing new", async () => {
        const user = userEvent.setup();
        setup(feed(0, []));
        await user.click(screen.getByRole("button", { name: "Notifications" }));
        expect(screen.getByText(/You're all caught up/)).toBeInTheDocument();
        expect(state.markRead).not.toHaveBeenCalled();
    });

    it("hears about other people's changes live: reloads, refreshes the page and pops a toast", async () => {
        setup();
        state.load.mockResolvedValue(feed(2, [item("2", { type: "cancel_requested", customer_name: "Rita" }), item("1")]));
        act(() => state.onInsert?.({ new: { actor_id: "someone-else" } }));

        await waitFor(() => expect(state.toast).toHaveBeenCalledWith("Rita asked to cancel", expect.objectContaining({ description: expect.any(String) })));
        expect(state.load).toHaveBeenCalledWith("biz");
        expect(state.refresh).toHaveBeenCalled();
        expect(screen.getByTestId("notification-count")).toHaveTextContent("2");
    });

    it("ignores changes you made yourself", async () => {
        setup();
        act(() => state.onInsert?.({ new: { actor_id: "me" } }));
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(state.load).not.toHaveBeenCalled();
    });

    it("doesn't announce things it already showed", async () => {
        setup();
        state.load.mockResolvedValue(feed(1, [item("1")]));
        act(() => state.onInsert?.({ new: { actor_id: "someone-else" } }));
        await waitFor(() => expect(state.load).toHaveBeenCalled());
        expect(state.toast).not.toHaveBeenCalled();
    });
});
