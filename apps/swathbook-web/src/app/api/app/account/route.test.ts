// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const state = vi.hoisted(() => ({ admin: null as unknown as SupabaseMock, deleteUser: vi.fn() }));

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
    state.deleteUser.mockReset().mockResolvedValue({ error: null });
});

describe("DELETE /api/app/account", () => {
    it("deletes a customer's login", async () => {
        const response = await del();
        expect(response.status).toBe(200);
        expect(state.deleteUser).toHaveBeenCalledWith("u1");
    });

    it("won't delete someone who runs or works for a business", async () => {
        state.admin.respond("business_members.select", { count: 1 });
        const response = await del();
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: "has_business" });
        expect(state.deleteUser).not.toHaveBeenCalled();
    });
});
