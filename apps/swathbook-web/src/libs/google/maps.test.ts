// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addressFromComponents, autocompleteAddress, navigationUrl, placeDetails, staticMapUrl, travelMatrix } from "./maps";

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

function respond(body: unknown, ok = true) {
    fetchMock.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) });
}

describe("addressFromComponents", () => {
    it("maps Google components to our address fields", () => {
        expect(
            addressFromComponents([
                { longText: "1600", shortText: "1600", types: ["street_number"] },
                { longText: "Amphitheatre Parkway", shortText: "Amphitheatre Pkwy", types: ["route"] },
                { longText: "4", shortText: "4", types: ["subpremise"] },
                { longText: "Mountain View", shortText: "Mountain View", types: ["locality", "political"] },
                { longText: "California", shortText: "CA", types: ["administrative_area_level_1"] },
                { longText: "94043", shortText: "94043", types: ["postal_code"] },
                { longText: "United States", shortText: "US", types: ["country"] },
            ]),
        ).toEqual({ line1: "1600 Amphitheatre Pkwy", line2: "#4", city: "Mountain View", region: "CA", postalCode: "94043", country: "US" });
    });
});

describe("autocompleteAddress", () => {
    it("asks Places for US street addresses and returns up to five suggestions", async () => {
        respond({
            suggestions: [
                { placePrediction: { placeId: "p1", structuredFormat: { mainText: { text: "10 Oak Ln" }, secondaryText: { text: "Austin, TX" } } } },
                { queryPrediction: { text: { text: "oak" } } },
            ],
        });
        expect(await autocompleteAddress("10 Oak", "token-1")).toEqual([{ placeId: "p1", primary: "10 Oak Ln", secondary: "Austin, TX" }]);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
        expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
        expect(JSON.parse(init.body)).toMatchObject({ input: "10 Oak", sessionToken: "token-1", includedRegionCodes: ["us"] });
    });

    it("doesn't call Google for very short input", async () => {
        expect(await autocompleteAddress("10", "token-1")).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns nothing without an API key", async () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
        expect(await autocompleteAddress("10 Oak Lane", "token-1")).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("degrades gracefully when Google errors", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        respond({ error: "quota" }, false);
        expect(await autocompleteAddress("10 Oak Lane", "token-1")).toEqual([]);
    });
});

describe("placeDetails", () => {
    it("rejects malformed place ids without calling Google", async () => {
        expect(await placeDetails("../../secrets")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("resolves coordinates and address parts", async () => {
        respond({
            id: "ChIJ1234567890",
            formattedAddress: "10 Oak Ln, Austin, TX 78701, USA",
            location: { latitude: 30.27, longitude: -97.74 },
            addressComponents: [
                { longText: "10", shortText: "10", types: ["street_number"] },
                { longText: "Oak Lane", shortText: "Oak Ln", types: ["route"] },
                { longText: "Austin", shortText: "Austin", types: ["locality"] },
                { longText: "Texas", shortText: "TX", types: ["administrative_area_level_1"] },
                { longText: "78701", shortText: "78701", types: ["postal_code"] },
            ],
        });
        expect(await placeDetails("ChIJ1234567890", "token-1")).toMatchObject({
            placeId: "ChIJ1234567890",
            line1: "10 Oak Ln",
            city: "Austin",
            region: "TX",
            postalCode: "78701",
            lat: 30.27,
            lng: -97.74,
        });
    });
});

describe("travelMatrix", () => {
    const points = [
        { lat: 30.27, lng: -97.74 },
        { lat: 30.3, lng: -97.7 },
    ];

    it("uses Google's drive times when available", async () => {
        respond([
            { originIndex: 0, destinationIndex: 1, duration: "900s", distanceMeters: 8000, condition: "ROUTE_EXISTS" },
            { originIndex: 1, destinationIndex: 0, duration: "960s", distanceMeters: 8200, condition: "ROUTE_EXISTS" },
        ]);
        const { matrix, source } = await travelMatrix(points);
        expect(source).toBe("google");
        expect(matrix.durations[0][1]).toBe(900);
        expect(matrix.distances[1][0]).toBe(8200);
        expect(matrix.durations[0][0]).toBe(0);
    });

    it("falls back to estimates without a key", async () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
        const { source, matrix } = await travelMatrix(points);
        expect(source).toBe("estimate");
        expect(matrix.durations[0][1]).toBeGreaterThan(0);
    });
});

describe("map links", () => {
    it("builds a static map with numbered stops and the route polyline", () => {
        const url = new URL(staticMapUrl({ start: { lat: 1, lng: 2 }, stops: [{ lat: 3, lng: 4 }], polyline: "abc" })!);
        expect(url.searchParams.getAll("markers")).toEqual(["color:0x14261b|label:H|1,2", "color:0x1f5a3a|label:1|3,4"]);
        expect(url.searchParams.get("path")).toBe("color:0x1f5a3aff|weight:5|enc:abc");
        expect(url.searchParams.get("key")).toBe("test-key");
    });

    it("has no static map without a key", () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
        expect(staticMapUrl({ start: null, stops: [], polyline: null })).toBeNull();
    });

    it("opens turn-by-turn navigation through every stop (no key needed)", () => {
        const url = new URL(navigationUrl([{ lat: 3, lng: 4 }, { lat: 5, lng: 6 }], { lat: 1, lng: 2 })!);
        expect(url.searchParams.get("origin")).toBe("1,2");
        expect(url.searchParams.get("waypoints")).toBe("3,4");
        expect(url.searchParams.get("destination")).toBe("5,6");
        expect(navigationUrl([])).toBeNull();
    });
});
