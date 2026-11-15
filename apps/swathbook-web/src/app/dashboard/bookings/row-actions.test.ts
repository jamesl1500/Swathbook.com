import { describe, expect, it, vi } from "vitest";

vi.mock("../schedule/job-actions", () => ({ useJobStatus: vi.fn() }));

import { bookingRowActions, type RowBooking } from "./row-actions";

const base: RowBooking = {
    id: "b1",
    status: "confirmed",
    customerName: "Pat",
    customerPhone: "512-555-0100",
    customerEmail: "pat@example.com",
    href: "/dashboard/schedule/b1",
    started: false,
    cancelRequested: false,
};
const owner = { canManage: true, canWork: true };
const keys = (booking: Partial<RowBooking>, who = owner) => {
    const { primary, menu } = bookingRowActions({ ...base, ...booking }, who);
    return { primary: primary?.key ?? null, menu: menu.map((step) => step.key) };
};

describe("bookingRowActions", () => {
    it("offers starting a job on the day, finishing it once started", () => {
        expect(keys({ started: true }).primary).toBe("start");
        expect(keys({ status: "in_progress", started: true }).primary).toBe("complete");
        expect(keys({ started: false }).primary).toBeNull();
    });

    it("keeps everything else in the menu, cancel last", () => {
        expect(keys({})).toEqual({ primary: null, menu: ["open", "call", "email", "start", "complete", "cancel"] });
        expect(keys({ started: true }).menu).toEqual(["open", "call", "email", "complete", "noshow", "cancel"]);
        expect(keys({ status: "pending_payment" }).menu).toEqual(["open", "call", "email", "confirm", "cancel"]);
        expect(keys({ status: "completed" }).menu).toEqual(["open", "call", "email"]);
    });

    it("leaves out contact options it can't offer", () => {
        expect(keys({ customerPhone: null, customerEmail: null, status: "completed" }).menu).toEqual(["open"]);
    });

    it("lets crew work their own jobs but not cancel or confirm them", () => {
        const crew = { canManage: false, canWork: true };
        expect(keys({ started: true }, crew)).toEqual({ primary: "start", menu: ["open", "call", "email", "complete", "noshow"] });
        expect(keys({ status: "pending_payment" }, crew).menu).toEqual(["open", "call", "email"]);
        expect(keys({ started: true }, { canManage: false, canWork: false })).toEqual({ primary: null, menu: ["open", "call", "email"] });
    });

    it("holds off on working a job while a cancellation is being decided", () => {
        expect(keys({ started: true, cancelRequested: true })).toEqual({ primary: null, menu: ["open", "call", "email", "cancel"] });
    });
});
