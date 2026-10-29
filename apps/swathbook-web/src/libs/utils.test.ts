import { describe, expect, it } from "vitest";
import { brandTextColor, cn, formatCents, formatDuration, formatPrice, slugify } from "./utils";

describe("slugify", () => {
    it.each([
        ["Green Acres Lawn Co.", "green-acres-lawn-co"],
        ["Leaf & Lawn", "leaf-and-lawn"],
        ["  Café Détail  ", "cafe-detail"],
        ["Bob's #1 Plumbing!!", "bob-s-1-plumbing"],
        ["---", ""],
    ])("%s -> %s", (input, expected) => {
        expect(slugify(input)).toBe(expected);
    });

    it("caps length at 40 without a trailing dash", () => {
        const slug = slugify("a".repeat(39) + " b");
        expect(slug.length).toBeLessThanOrEqual(40);
        expect(slug.endsWith("-")).toBe(false);
    });
});

describe("formatPrice", () => {
    it("drops cents for whole dollars", () => expect(formatPrice(45)).toBe("$45"));
    it("keeps cents otherwise", () => expect(formatPrice(45.5)).toBe("$45.50"));
});

describe("formatDuration", () => {
    it.each([
        [45, "45 min"],
        [60, "1 hr"],
        [90, "1 hr 30 min"],
        [240, "4 hr"],
    ])("%i -> %s", (minutes, label) => {
        expect(formatDuration(minutes)).toBe(label);
    });
});

describe("cn", () => {
    it("joins truthy class names", () => {
        expect(cn("a", false, null, undefined, "b")).toBe("a b");
    });
});

describe("formatCents", () => {
    it("formats whole and fractional amounts", () => {
        expect(formatCents(4500)).toBe("$45");
        expect(formatCents(4550)).toBe("$45.50");
        expect(formatCents(0)).toBe("$0");
    });
});

describe("brandTextColor", () => {
    it("uses white on dark and saturated brand colors", () => {
        expect(brandTextColor("#1c3d70")).toBe("#ffffff");
        expect(brandTextColor("#14202e")).toBe("#ffffff");
        expect(brandTextColor("#b42318")).toBe("#ffffff");
    });

    it("uses ink on pale brand colors", () => {
        expect(brandTextColor("#ff7a33")).toBe("#14202e");
        expect(brandTextColor("#ffffff")).toBe("#14202e");
        expect(brandTextColor("#a7f3d0")).toBe("#14202e");
    });

    it("falls back to white for anything that isn't a hex color", () => {
        expect(brandTextColor("teal")).toBe("#ffffff");
    });
});
