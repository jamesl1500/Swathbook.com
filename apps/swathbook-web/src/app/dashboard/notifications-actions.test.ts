// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID } from "@/test/dashboard";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock, auth: {} as Record<string, unknown> }));

vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import { loadNotifications, markNotificationsRead } from "./notifications-actions";

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.auth = { user: { id: "u1" }, role: "crew", businessId: BUSINESS_ID };
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifications", () => {
    it("loads the member's feed as them (any role)", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: { unread: 3, items: [] }, error: null });
        expect(await loadNotifications(BUSINESS_ID)).toEqual({ unread: 3, items: [] });
        expect(state.supabase.rpc).toHaveBeenCalledWith("my_notifications", { p_business_id: BUSINESS_ID, p_limit: 20 });
    });

    it("returns an empty feed for someone outside the business, without asking the database", async () => {
        state.auth = { error: "You don't have access to that business." };
        expect(await loadNotifications(BUSINESS_ID)).toEqual({ unread: 0, items: [] });
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("returns an empty feed when loading fails", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
        expect(await loadNotifications(BUSINESS_ID)).toEqual({ unread: 0, items: [] });
    });

    it("catches up", async () => {
        expect(await markNotificationsRead(BUSINESS_ID)).toEqual({ ok: true });
        expect(state.supabase.rpc).toHaveBeenCalledWith("mark_notifications_read", { p_business_id: BUSINESS_ID });
    });
});
