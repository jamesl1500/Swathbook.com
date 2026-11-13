// @vitest-environment node
/** Adding, removing and reordering services (saving edits is in dashboard-actions.test.ts). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";
import { BUSINESS_ID, form } from "@/test/dashboard";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock, auth: {} as Record<string, unknown> }));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));

import { deleteService, moveService, saveService } from "./actions";

const LIST = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
    { id: "c", sort_order: 2 },
];

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.auth = { user: { id: "u1" }, role: "owner", businessId: BUSINESS_ID };
});

describe("saveService (new)", () => {
    it("adds new services at the end of the list", async () => {
        state.supabase.respond("services.select", { count: 3 });
        expect(await saveService({}, form({ name: "Leaf cleanup", priceType: "fixed", price: "60", durationMinutes: "60", depositType: "none" }))).toEqual({ success: "Service added." });
        expect(state.supabase.callsTo("services", "insert")[0].values).toMatchObject({ business_id: BUSINESS_ID, sort_order: 3 });
    });
});

describe("deleteService", () => {
    it("removes the service within this business", async () => {
        expect(await deleteService(form({ serviceId: "a" }))).toEqual({ success: "Service removed." });
        expect(state.supabase.callsTo("services", "delete")[0].filters).toEqual([
            ["eq", "id", "a"],
            ["eq", "business_id", BUSINESS_ID],
        ]);
    });

    it("explains failures", async () => {
        state.supabase.respond("services.delete", { error: { message: "boom" } });
        expect((await deleteService(form({ serviceId: "a" }))).error).toBe("We couldn't remove that service.");
    });
});

describe("moveService", () => {
    const writes = () =>
        state.supabase.callsTo("services", "update").map((call) => [call.filters.find(([, column]) => column === "id")?.[2], (call.values as { sort_order: number }).sort_order]);

    it("swaps a service with its neighbor, writing only what changed", async () => {
        state.supabase.respond("services.select", { data: LIST });
        await moveService(form({ serviceId: "c", direction: "up" }));
        expect(writes()).toEqual([
            ["c", 1],
            ["b", 2],
        ]);
    });

    it("moves down too", async () => {
        state.supabase.respond("services.select", { data: LIST });
        await moveService(form({ serviceId: "a", direction: "down" }));
        expect(writes()).toEqual([
            ["b", 0],
            ["a", 1],
        ]);
    });

    it("tidies gaps in the order while it's at it", async () => {
        state.supabase.respond("services.select", { data: [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 5 }, { id: "c", sort_order: 9 }] });
        await moveService(form({ serviceId: "a", direction: "down" }));
        expect(writes()).toEqual([
            ["b", 0],
            ["a", 1],
            ["c", 2],
        ]);
    });

    it("does nothing past either end or for unknown services", async () => {
        state.supabase.respond("services.select", { data: LIST });
        expect(await moveService(form({ serviceId: "a", direction: "up" }))).toEqual({});
        expect(await moveService(form({ serviceId: "c", direction: "down" }))).toEqual({});
        expect(await moveService(form({ serviceId: "zzz", direction: "up" }))).toEqual({});
        expect(writes()).toEqual([]);
    });

    it("is for owners and admins", async () => {
        state.auth = { error: "Only owners and admins can change this." };
        expect((await moveService(form({ serviceId: "a", direction: "down" }))).error).toBeDefined();
        expect(state.supabase.calls).toHaveLength(0);
    });
});
