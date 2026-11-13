// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const maps = vi.hoisted(() => ({ hasGoogleMaps: vi.fn(() => true), geocodeAddress: vi.fn(), placeDetails: vi.fn() }));
vi.mock("./google/maps", () => maps);

import { formatAddress, readAddress, withCoordinates, type ParsedAddress } from "./address";

function form(fields: Record<string, string>, prefix = "address") {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(`${prefix}.${key}`, value);
    return data;
}

const parsed = (overrides: Partial<ParsedAddress> = {}): ParsedAddress => ({
    line1: "1 Main St",
    line2: "",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    placeId: "",
    lat: null,
    lng: null,
    ...overrides,
});

beforeEach(() => {
    maps.hasGoogleMaps.mockReturnValue(true);
    maps.geocodeAddress.mockReset().mockResolvedValue(null);
    maps.placeDetails.mockReset().mockResolvedValue(null);
});

describe("readAddress", () => {
    it("reads prefixed fields, trimming and parsing coordinates", () => {
        const result = readAddress(form({ line1: " 1 Main St ", city: "Austin", lat: "30.2672", lng: "-97.7431" }, "billing"), "billing");
        expect(result.success && result.data).toEqual({ line1: "1 Main St", line2: "", city: "Austin", region: "", postalCode: "", placeId: "", lat: 30.2672, lng: -97.7431 });
    });

    it("treats blank coordinates as missing and rejects impossible ones", () => {
        const blank = readAddress(form({ line1: "1 Main St", lat: "", lng: "" }));
        expect(blank.success && [blank.data.lat, blank.data.lng]).toEqual([null, null]);
        expect(readAddress(form({ line1: "1 Main St", lat: "91", lng: "0" })).success).toBe(false);
        expect(readAddress(form({ line1: "1 Main St", lat: "0", lng: "-181" })).success).toBe(false);
        expect(readAddress(form({ line1: "1 Main St", lat: "north" })).success).toBe(false);
    });

    it("needs a street", () => {
        const result = readAddress(form({ line1: " a " }));
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("Enter a street address.");
    });
});

describe("withCoordinates", () => {
    it("keeps coordinates the browser sent without calling Google", async () => {
        const row = await withCoordinates(parsed({ lat: 30, lng: -97, placeId: "pl_browser" }));
        expect(row).toMatchObject({ lat: 30, lng: -97, google_place_id: "pl_browser", line2: null, formatted_address: null });
        expect(maps.placeDetails).not.toHaveBeenCalled();
        expect(maps.geocodeAddress).not.toHaveBeenCalled();
    });

    it("resolves a picked place first", async () => {
        maps.placeDetails.mockResolvedValue({ lat: 30.1, lng: -97.1, formatted: "1 Main St, Austin, TX 78701" });
        const row = await withCoordinates(parsed({ placeId: "pl_1" }));
        expect(row).toMatchObject({ lat: 30.1, lng: -97.1, google_place_id: "pl_1", formatted_address: "1 Main St, Austin, TX 78701" });
        expect(maps.geocodeAddress).not.toHaveBeenCalled();
    });

    it("falls back to geocoding the typed address", async () => {
        maps.geocodeAddress.mockResolvedValue({ lat: 30.2, lng: -97.2, placeId: "pl_geo", formatted: "Formatted" });
        const row = await withCoordinates(parsed({ line2: "Unit 4", postalCode: "" }));
        expect(maps.geocodeAddress).toHaveBeenCalledWith("1 Main St, Austin, TX");
        expect(row).toEqual({
            line1: "1 Main St",
            line2: "Unit 4",
            city: "Austin",
            region: "TX",
            postal_code: null,
            lat: 30.2,
            lng: -97.2,
            google_place_id: "pl_geo",
            formatted_address: "Formatted",
        });
    });

    it("saves the address without coordinates when maps are off or nothing matches", async () => {
        expect(await withCoordinates(parsed())).toMatchObject({ lat: null, lng: null, google_place_id: null });
        maps.hasGoogleMaps.mockReturnValue(false);
        await withCoordinates(parsed());
        expect(maps.geocodeAddress).toHaveBeenCalledTimes(1);
    });
});

describe("formatAddress", () => {
    it("joins the parts people expect, skipping blanks", () => {
        expect(formatAddress({ line1: "1 Main St", line2: "Unit 4", city: "Austin", region: "TX", postal_code: "78701" })).toBe("1 Main St, Unit 4, Austin, TX 78701");
        expect(formatAddress({ line1: "1 Main St", city: null, region: "TX", postal_code: null })).toBe("1 Main St, TX");
        expect(formatAddress({ line1: "1 Main St" })).toBe("1 Main St");
    });
});
