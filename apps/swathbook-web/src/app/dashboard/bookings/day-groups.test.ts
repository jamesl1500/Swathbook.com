import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "./day-groups";

describe("groupByDay", () => {
    it("groups consecutive rows by the business's local day, keeping list order", () => {
        const rows = [
            { id: "a", scheduled_start: "2026-11-14T15:00:00Z" },
            { id: "b", scheduled_start: "2026-11-14T22:00:00Z" },
            // 11:30 PM on the 14th in Chicago, though it's the 15th in UTC.
            { id: "c", scheduled_start: "2026-11-15T05:30:00Z" },
            { id: "d", scheduled_start: "2026-11-16T15:00:00Z" },
        ];
        expect(groupByDay(rows, "America/Chicago").map((group) => [group.dateKey, group.rows.map((row) => row.id)])).toEqual([
            ["2026-11-14", ["a", "b", "c"]],
            ["2026-11-16", ["d"]],
        ]);
    });

    it("is empty for no rows", () => {
        expect(groupByDay([], "UTC")).toEqual([]);
    });
});

describe("dayLabel", () => {
    it("names nearby days and dates the rest", () => {
        expect(dayLabel("2026-11-14", "2026-11-14")).toBe("Today");
        expect(dayLabel("2026-11-15", "2026-11-14")).toBe("Tomorrow");
        expect(dayLabel("2026-11-13", "2026-11-14")).toBe("Yesterday");
        expect(dayLabel("2026-11-20", "2026-11-14")).toBe("Fri, Nov 20");
    });
});
