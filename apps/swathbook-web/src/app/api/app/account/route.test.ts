// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ admin: null as unknown as SupabaseMock, deleteUser: vi.fn(), counts: {} as Record<string, number> }));

vi.mock("@/libs/app-api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/libs/app-api")>()),
    authenticateApp: vi.fn(async () => ({ user: { id: "u1", email: "cara@example.com" }, supabase: {} })),
}));
vi.mock("@/libs/supabase/admin", () => ({
    createAdminClient: () => ({ ...state.admin.client, auth: { admin: { deleteUser: state.deleteUser } } }),
}));

import { DELETE } from "./route";

const del = () => DELETE(new Request("http://localhost/api/app/account", { method: "DELETE" }));

beforeEach(() => {
    state.admin = createSupabaseMock();
    // Count queries return a number (0 when nothing matches), like the real API.
    state.admin.respond("business_members.select", ({ table }) => ({ count: state.counts[table] ?? 0 }));
    state.admin.respond("businesses.select", ({ table }) => ({ count: state.counts[table] ?? 0 }));
    state.counts = {};
    state.deleteUser.mockReset().mockResolvedValue({ error: null });
});

describe("DELETE /api/app/account", () => {
    it("deletes a customer's login", async () => {
        const response = await del();
        expect(response.status).toBe(200);
        expect(state.deleteUser).toHaveBeenCalledWith("u1");
    });

    it("won't delete someone who runs or works for a business", async () => {
        state.counts.business_members = 1;
        const response = await del();
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: "has_business" });
        expect(state.deleteUser).not.toHaveBeenCalled();
    });

    it("deletes nothing when it can't check for a business", async () => {
        state.admin = createSupabaseMock();
        state.admin.respond("business_members.select", { count: 0 });
        state.admin.respond("businesses.select", { error: { message: "connection reset" } });
        const response = await del();
        expect(response.status).toBe(500);
        expect(state.deleteUser).not.toHaveBeenCalled();
    });
});
