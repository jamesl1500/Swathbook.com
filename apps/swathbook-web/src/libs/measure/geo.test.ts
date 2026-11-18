import { describe, expect, it } from "vitest";
import { checkArea, checkMeasurement, distanceMeters, fromImagePoint, MAP_SIZE, polygonAreaSqft, toImagePoint, totalAreaSqft, type Polygon } from "./geo";

const HOME = { lat: 30.2672, lng: -97.7431 };

/** A square `side` meters across, centered on `center`. */
function square(center: { lat: number; lng: number }, side: number): Polygon {
    const dLat = side / 2 / 111_195.08;
    const dLng = side / 2 / (111_195.08 * Math.cos((center.lat * Math.PI) / 180));
    return [
        [center.lat - dLat, center.lng - dLng],
        [center.lat - dLat, center.lng + dLng],
        [center.lat + dLat, center.lng + dLng],
        [center.lat + dLat, center.lng - dLng],
    ];
}

describe("map image projection", () => {
    it("puts the center in the middle of the image", () => {
        expect(toImagePoint(HOME, HOME, 20)).toEqual({ x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
    });

    it("round-trips points at every zoom", () => {
        for (const zoom of [18, 19, 20]) {
            const point = fromImagePoint(100, 520, HOME, zoom);
            const back = toImagePoint(point, HOME, zoom);
            expect(back.x).toBeCloseTo(100, 6);
            expect(back.y).toBeCloseTo(520, 6);
        }
    });

    it("matches Google's scale: about 0.13 m per pixel at zoom 20 in Austin", () => {
        const left = fromImagePoint(0, 320, HOME, 20);
        const right = fromImagePoint(640, 320, HOME, 20);
        // 156543.03 m/px at zoom 0, halved per zoom level, times cos(latitude).
        const expected = ((156_543.03 / 2 ** 20) * Math.cos((HOME.lat * Math.PI) / 180)) * 640;
        expect(distanceMeters(left, right)).toBeCloseTo(expected, 0);
    });

    it("keeps north up (smaller y is further north)", () => {
        expect(fromImagePoint(320, 0, HOME, 20).lat).toBeGreaterThan(HOME.lat);
    });
});

describe("areas", () => {
    it("measures a 30 m square as about 9,688 sq ft", () => {
        // 900 m² × 10.7639
        expect(polygonAreaSqft(square(HOME, 30))).toBeCloseTo(9_687.5, -1);
    });

    it("doesn't care which way the outline was drawn", () => {
        const outline = square(HOME, 20);
        expect(polygonAreaSqft([...outline].reverse())).toBeCloseTo(polygonAreaSqft(outline), 6);
    });

    it("adds separate areas together and ignores lines that aren't shapes", () => {
        const front = square(HOME, 10);
        const back = square({ lat: HOME.lat + 0.0003, lng: HOME.lng }, 10);
        expect(totalAreaSqft([front, back])).toBe(Math.round(polygonAreaSqft(front) + polygonAreaSqft(back)));
        expect(polygonAreaSqft(front.slice(0, 2))).toBe(0);
    });
});

describe("checkMeasurement", () => {
    it("works the area out itself", () => {
        const result = checkMeasurement([square(HOME, 30)], HOME);
        expect(result).toEqual({ ok: true, areaSqft: expect.any(Number), polygons: [expect.any(Array)] });
        if (result.ok) expect(result.areaSqft).toBeCloseTo(9_688, -2);
    });

    it("refuses outlines that aren't at the address", () => {
        const elsewhere = square({ lat: HOME.lat + 0.01, lng: HOME.lng }, 30);
        expect(checkMeasurement([elsewhere], HOME)).toEqual({ ok: false, error: "Outline the area at your address." });
    });

    it("refuses junk", () => {
        expect(checkMeasurement([], HOME).ok).toBe(false);
        expect(checkMeasurement("nope", HOME).ok).toBe(false);
        expect(checkMeasurement([[["a", "b"], [1, 2], [3, 4]]], HOME).ok).toBe(false);
        expect(checkMeasurement([[[30, -97]]], HOME).ok).toBe(false);
        expect(checkMeasurement(Array.from({ length: 7 }, () => square(HOME, 5)), HOME).ok).toBe(false);
    });

    it("keeps sizes between 100 sq ft and 10 acres", () => {
        expect(checkArea(99).ok).toBe(false);
        expect(checkArea(100)).toEqual({ ok: true, areaSqft: 100, polygons: [] });
        expect(checkArea(435_600).ok).toBe(true);
        expect(checkArea(435_601)).toEqual({ ok: false, error: "That's over 10 acres. Please contact the business for a quote." });
        expect(checkArea(Number.NaN).ok).toBe(false);
    });
});
