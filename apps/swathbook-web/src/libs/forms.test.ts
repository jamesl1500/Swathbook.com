import { describe, expect, it } from "vitest";
import { checkbox, dollarsToCents, text } from "./forms";
import { minutesToTimeKey } from "./routing/plan";

describe("dollarsToCents", () => {
    it.each([
        ["45", 4500],
        ["45.5", 4550],
        ["$1,200.99", 120099],
        [" 0 ", 0],
    ])("%s -> %i", (input, cents) => {
        expect(dollarsToCents.parse(input)).toBe(cents);
    });

    it.each(["abc", "45.999", "-5", "", "1234567"])("rejects %j", (input) => {
        expect(dollarsToCents.safeParse(input).success).toBe(false);
    });
});

describe("FormData readers", () => {
    it("trims text and treats missing values as empty", () => {
        const data = new FormData();
        data.set("name", "  Dana  ");
        expect(text(data, "name")).toBe("Dana");
        expect(text(data, "missing")).toBe("");
    });

    it("reads checkboxes", () => {
        const data = new FormData();
        data.set("on", "on");
        expect(checkbox(data, "on")).toBe(true);
        expect(checkbox(data, "off")).toBe(false);
    });
});

describe("minutesToTimeKey", () => {
    it.each([
        [0, "00:00"],
        [9 * 60 + 5, "09:05"],
        [23 * 60 + 59.6, "23:59"],
        [-30, "00:00"],
    ])("%d -> %s", (minutes, key) => {
        expect(minutesToTimeKey(minutes)).toBe(key);
    });
});
