import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canMeasure, satelliteImageUrl, satelliteLinks, verifySatelliteLink } from "./satellite";

const HOME = { lat: 30.2672, lng: -97.7431 };
const NOW = Date.parse("2026-11-18T12:00:00Z");

function query(link: string) {
    return new URL(link, "https://swathbook.test").searchParams;
}

beforeEach(() => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "maps-key");
});

afterEach(() => vi.unstubAllEnvs());

describe("signed satellite links", () => {
    it("signs one link per zoom, without the Google key", () => {
        const links = satelliteLinks(HOME, NOW)!;
        expect(Object.keys(links)).toEqual(["18", "19", "20"]);
        expect(links[20]).toMatch(/^\/api\/maps\/satellite\?c=30\.267200%2C-97\.743100&z=20&e=\d+&s=/);
        expect(links[20]).not.toContain("maps-key");
    });

    it("verifies its own links", () => {
        const links = satelliteLinks(HOME, NOW)!;
        expect(verifySatelliteLink(query(links[19]), NOW)).toEqual({ center: HOME, zoom: 19 });
    });

    it("rejects a link moved somewhere else, a changed zoom, or one that's expired", () => {
        const params = query(satelliteLinks(HOME, NOW)![20]);
        const moved = new URLSearchParams(params);
        moved.set("c", "40.712800,-74.006000");
        expect(verifySatelliteLink(moved, NOW)).toBeNull();

        const zoomed = new URLSearchParams(params);
        zoomed.set("z", "18");
        expect(verifySatelliteLink(zoomed, NOW)).toBeNull();

        expect(verifySatelliteLink(params, NOW + 3 * 60 * 60 * 1000)).toBeNull();
        expect(verifySatelliteLink(new URLSearchParams(), NOW)).toBeNull();
    });

    it("rejects links signed with another secret", () => {
        const params = query(satelliteLinks(HOME, NOW)![20]);
        vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_other");
        expect(verifySatelliteLink(params, NOW)).toBeNull();
    });

    it("builds the Static Maps request for a verified link", () => {
        const url = new URL(satelliteImageUrl({ center: HOME, zoom: 20 })!);
        expect(url.searchParams.get("maptype")).toBe("satellite");
        expect(url.searchParams.get("center")).toBe("30.267200,-97.743100");
        expect(url.searchParams.get("size")).toBe("640x640");
        expect(url.searchParams.get("key")).toBe("maps-key");
    });

    it("is off without Google Maps", () => {
        vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
        expect(canMeasure()).toBe(false);
        expect(satelliteLinks(HOME, NOW)).toBeNull();
    });
});
