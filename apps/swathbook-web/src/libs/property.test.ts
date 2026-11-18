import { describe, expect, it } from "vitest";
import { checkPropertyMap, hasPropertyNotes, propertyNotesSchema, readPropertyMap } from "./property";

const HOME = { lat: 30.2672, lng: -97.7431 };

describe("readPropertyMap", () => {
    it("reads a stored map and fills in what's missing", () => {
        expect(readPropertyMap({ markers: [{ kind: "gate", label: "Side gate", lat: 30.2672, lng: -97.7431 }] })).toEqual({
            markers: [{ kind: "gate", label: "Side gate", lat: 30.2672, lng: -97.7431 }],
            areas: [],
        });
    });

    it("treats nothing, or something odd, as an empty map", () => {
        expect(readPropertyMap(null)).toEqual({ markers: [], areas: [] });
        expect(readPropertyMap({ markers: [{ kind: "spaceship" }] })).toEqual({ markers: [], areas: [] });
    });
});

describe("checkPropertyMap", () => {
    it("keeps pins and areas at the property, rounded", () => {
        const result = checkPropertyMap(
            {
                markers: [{ kind: "pet", label: "Dog run", lat: 30.267212345678, lng: -97.74311 }],
                areas: [{ kind: "avoid", label: "Beds", points: [[30.2672, -97.7431], [30.2673, -97.7431], [30.2673, -97.7432]] }],
            },
            HOME,
        );
        expect(result).toEqual({
            ok: true,
            map: {
                markers: [{ kind: "pet", label: "Dog run", lat: 30.2672123, lng: -97.74311 }],
                areas: [{ kind: "avoid", label: "Beds", points: [[30.2672, -97.7431], [30.2673, -97.7431], [30.2673, -97.7432]] }],
            },
        });
    });

    it("refuses pins down the street", () => {
        expect(checkPropertyMap({ markers: [{ kind: "gate", label: "", lat: 30.28, lng: -97.7431 }], areas: [] }, HOME)).toEqual({
            ok: false,
            error: "Keep pins and areas on the property.",
        });
    });

    it("stores an empty map as nothing, and needs a location for pins", () => {
        expect(checkPropertyMap({ markers: [], areas: [] }, HOME)).toEqual({ ok: true, map: null });
        expect(checkPropertyMap({ markers: [{ kind: "gate", label: "", lat: 30, lng: -97 }], areas: [] }, null).ok).toBe(false);
    });
});

describe("propertyNotesSchema", () => {
    it("trims and bounds the text", () => {
        expect(propertyNotesSchema.parse({ gateCode: " 1234 ", pets: "", accessNotes: "", map: null }).gateCode).toBe("1234");
        expect(propertyNotesSchema.safeParse({ gateCode: "9".repeat(41), pets: "", accessNotes: "", map: null }).success).toBe(false);
    });
});

describe("hasPropertyNotes", () => {
    it("is true when there's anything to read", () => {
        expect(hasPropertyNotes({ gate_code: "1234" })).toBe(true);
        expect(hasPropertyNotes({ property_map: { markers: [{ kind: "gate", label: "", lat: 1, lng: 1 }] } })).toBe(true);
        expect(hasPropertyNotes({ gate_code: null, pets: null, access_notes: null, property_map: null })).toBe(false);
    });
});
