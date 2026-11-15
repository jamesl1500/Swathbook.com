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
        state.supabase.respond("services.insert", { data: { id: "svc_new" } });
        expect(await saveService({}, form({ name: "Leaf cleanup", priceType: "fixed", price: "60", durationMinutes: "60", depositType: "none" }))).toEqual({ success: "Service added." });
        expect(state.supabase.callsTo("services", "insert")[0].values).toMatchObject({ business_id: BUSINESS_ID, sort_order: 3 });
    });
});

describe("saveService: questions for customers", () => {
    const detail = { serviceId: "svc_1", name: "Full detail", priceType: "fixed", price: "180", durationMinutes: "180", depositType: "none" };

    it("saves the questions with the service, keeping ids and cleaning options", async () => {
        const questions = [
            { id: "6f1c1b0e-6d2a-4a52-9b8e-6f1c1b0e6d2a", prompt: " Make and model? ", kind: "text", options: ["ignored"], required: true },
            { prompt: "What kind of car?", kind: "choice", options: ["Sedan", " SUV ", "suv", ""], required: false },
        ];
        expect(await saveService({}, form({ ...detail, questions: JSON.stringify(questions) }))).toEqual({ success: "Service saved." });
        expect(state.supabase.rpc).toHaveBeenCalledWith("save_service_questions", {
            p_service_id: "svc_1",
            p_questions: [
                { id: "6f1c1b0e-6d2a-4a52-9b8e-6f1c1b0e6d2a", prompt: "Make and model?", kind: "text", options: [], required: true },
                { prompt: "What kind of car?", kind: "choice", options: ["Sedan", "SUV"], required: false },
            ],
        });
    });

    it("saves questions on a brand-new service using its new id", async () => {
        state.supabase.respond("services.select", { count: 0 });
        state.supabase.respond("services.insert", { data: { id: "svc_new" } });
        const fresh = { ...detail, serviceId: "" };
        await saveService({}, form({ ...fresh, questions: JSON.stringify([{ prompt: "Make and model?", kind: "text" }]) }));
        expect(state.supabase.rpc.mock.calls[0]).toMatchObject(["save_service_questions", { p_service_id: "svc_new" }]);
    });

    it("rejects a choice question without two options before saving anything", async () => {
        const result = await saveService({}, form({ ...detail, questions: JSON.stringify([{ prompt: "Color?", kind: "choice", options: ["Red", "red"] }]) }));
        expect(result).toEqual({
            error: "Question 1: Give at least two choices (up to 20).",
            fieldErrors: { questions: ["Question 1: Give at least two choices (up to 20)."] },
        });
        expect(state.supabase.callsTo("services")).toHaveLength(0);
        expect(state.supabase.rpc).not.toHaveBeenCalled();
    });

    it("caps questions per service", async () => {
        const many = Array.from({ length: 11 }, (_, index) => ({ prompt: `Question ${index + 1}?`, kind: "text" }));
        expect((await saveService({}, form({ ...detail, questions: JSON.stringify(many) }))).error).toBe("Ask up to 10 questions per service.");
    });

    it("says when the service saved but its questions didn't", async () => {
        state.supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect((await saveService({}, form({ ...detail, questions: "[]" }))).error).toBe("The service saved, but its questions didn't. Please try again.");
    });

    it("leaves questions alone when the form has no questions editor", async () => {
        await saveService({}, form(detail));
        expect(state.supabase.rpc).not.toHaveBeenCalled();
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
