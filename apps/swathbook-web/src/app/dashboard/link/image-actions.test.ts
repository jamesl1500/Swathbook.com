// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";
const PHOTO_ID = "0b6b0a56-2d0f-4c3e-9f0a-6a1d2c3b4e5f";

const state = vi.hoisted(() => ({ supabase: null as unknown as SupabaseMock }));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", () => ({
    authorizeBusiness: vi.fn(async () => ({ user: { id: "u1" }, role: "owner", businessId: BUSINESS_ID, business: { slug: "shine-on" } })),
    isFailure: (value: unknown) => typeof value === "object" && value !== null && "error" in value,
}));

import { deletePhoto, movePhoto, uploadCover, uploadPhoto } from "./actions";

function form(fields: Record<string, string | File>) {
    const data = new FormData();
    data.set("businessId", BUSINESS_ID);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const webp = () => new File([new Uint8Array(2048)], "van.webp", { type: "image/webp" });

beforeEach(() => {
    state.supabase = createSupabaseMock();
});

describe("uploadPhoto", () => {
    it("stores the file in the business's photos folder and appends it", async () => {
        state.supabase.respond("business_photos.select", { data: [{ sort_order: 4 }, { sort_order: 1 }] });
        expect(await uploadPhoto(form({ image: webp() }))).toEqual({ success: "Photo added." });

        const [upload] = state.supabase.uploaded;
        expect(upload.bucket).toBe("business-assets");
        expect(upload.path).toMatch(new RegExp(`^${BUSINESS_ID}/photos/[0-9a-f-]{36}\\.webp$`));
        expect(state.supabase.callsTo("business_photos", "insert")[0].values).toEqual({ business_id: BUSINESS_ID, storage_path: upload.path, sort_order: 5 });
    });

    it("refuses once the page has 12 photos, before uploading anything", async () => {
        state.supabase.respond("business_photos.select", { data: Array.from({ length: 12 }, (_, index) => ({ sort_order: index })) });
        const result = await uploadPhoto(form({ image: webp() }));
        expect(result.error).toMatch(/up to 12 photos/);
        expect(state.supabase.uploaded).toEqual([]);
    });

    it("rejects files that aren't images", async () => {
        const result = await uploadPhoto(form({ image: new File(["%PDF"], "menu.pdf", { type: "application/pdf" }) }));
        expect(result.error).toBe("Use a PNG, JPG or WebP image.");
    });

    it("cleans up the uploaded file when the row can't be saved", async () => {
        state.supabase.respond("business_photos.insert", { error: { message: "photo_limit" } });
        const result = await uploadPhoto(form({ image: webp() }));
        expect(result.error).toMatch(/up to 12 photos/);
        expect(state.supabase.removed).toEqual([{ bucket: "business-assets", paths: [state.supabase.uploaded[0].path] }]);
    });
});

describe("deletePhoto", () => {
    it("deletes the row for this business and removes its file", async () => {
        state.supabase.respond("business_photos.delete", { data: { storage_path: `${BUSINESS_ID}/photos/a.webp` } });
        expect(await deletePhoto(form({ photoId: PHOTO_ID }))).toEqual({ success: "Photo removed." });
        expect(state.supabase.callsTo("business_photos", "delete")[0].filters).toEqual([
            ["eq", "id", PHOTO_ID],
            ["eq", "business_id", BUSINESS_ID],
        ]);
        expect(state.supabase.removed).toEqual([{ bucket: "business-assets", paths: [`${BUSINESS_ID}/photos/a.webp`] }]);
    });
});

describe("movePhoto", () => {
    it("swaps neighbors and renumbers the order", async () => {
        state.supabase.respond("business_photos.select", { data: [{ id: "p0" }, { id: PHOTO_ID }, { id: "p2" }] });
        await movePhoto(form({ photoId: PHOTO_ID, direction: "earlier" }));
        const updates = state.supabase.callsTo("business_photos", "update").map((call) => [call.filters[0][2], (call.values as { sort_order: number }).sort_order]);
        expect(updates).toEqual([
            [PHOTO_ID, 0],
            ["p0", 1],
            ["p2", 2],
        ]);
    });
});

describe("uploadCover", () => {
    it("saves the new cover and removes the old file", async () => {
        state.supabase.respond("businesses.select", { data: { logo_path: null, cover_path: `${BUSINESS_ID}/cover-1.webp` } });
        expect(await uploadCover(form({ image: webp() }))).toEqual({ success: "Cover photo updated." });
        const path = state.supabase.uploaded[0].path;
        expect(path).toMatch(new RegExp(`^${BUSINESS_ID}/cover-\\d+\\.webp$`));
        expect(state.supabase.callsTo("businesses", "update")[0].values).toEqual({ cover_path: path });
        expect(state.supabase.removed).toEqual([{ bucket: "business-assets", paths: [`${BUSINESS_ID}/cover-1.webp`] }]);
    });
});
