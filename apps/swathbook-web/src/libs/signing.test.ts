import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addressKey, signLocation, verifyLocation } from "./signing";

const HOME = { line1: "10 Oak Ln", postalCode: "78701" };
const SPOT = { lat: 30.2672, lng: -97.7431 };
const NOW = Date.parse("2026-11-18T12:00:00Z");

beforeEach(() => vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test"));
afterEach(() => vi.unstubAllEnvs());

describe("signLocation and verifyLocation", () => {
    it("vouches for coordinates the server found, for that address", () => {
        const token = signLocation(SPOT, HOME, NOW)!;
        expect(verifyLocation(token, HOME, NOW)).toEqual(SPOT);
        // Small differences in how the street is typed still match.
        expect(verifyLocation(token, { line1: "  10 OAK  Ln ", postalCode: "78701" }, NOW)).toEqual(SPOT);
        // Without an address to check, only the signature and age matter.
        expect(verifyLocation(token, undefined, NOW)).toEqual(SPOT);
    });

    it("refuses moved coordinates, a different address, old tokens and other keys", () => {
        const token = signLocation(SPOT, HOME, NOW)!;
        expect(verifyLocation(token.replace("30.267200", "30.270200"), HOME, NOW)).toBeNull();
        expect(verifyLocation(token, { line1: "12 Elm St", postalCode: "78701" }, NOW)).toBeNull();
        expect(verifyLocation(token, HOME, NOW + 7 * 60 * 60 * 1000)).toBeNull();
        vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_other");
        expect(verifyLocation(token, HOME, NOW)).toBeNull();
    });

    it("refuses junk", () => {
        expect(verifyLocation(null)).toBeNull();
        expect(verifyLocation("30,-97")).toBeNull();
        expect(verifyLocation(`${"9".repeat(300)}`)).toBeNull();
        expect(verifyLocation("91,0|x|9999999999|sig", undefined, NOW)).toBeNull();
    });

    it("signs nothing without a server secret", () => {
        vi.stubEnv("SUPABASE_SECRET_KEY", "");
        expect(signLocation(SPOT, HOME, NOW)).toBeNull();
    });
});

describe("addressKey", () => {
    it("ignores case and spacing, not the street or ZIP", () => {
        expect(addressKey({ line1: "10 Oak Ln", postalCode: "78701" })).toBe(addressKey({ line1: "10  oak ln ", postalCode: " 78701" }));
        expect(addressKey({ line1: "10 Oak Ln", postalCode: "78702" })).not.toBe(addressKey(HOME));
    });
});
