import { describe, expect, it } from "vitest";
import { layoutDay } from "./calendar-layout";

const at = (hours: number) => hours * 60;

describe("layoutDay", () => {
    it("gives non-overlapping events the full width", () => {
        const layout = layoutDay([
            { id: "a", start: at(8), end: at(9) },
            { id: "b", start: at(9), end: at(10) }, // touching, not overlapping
        ]);
        expect(layout.get("a")).toEqual({ lane: 0, lanes: 1 });
        expect(layout.get("b")).toEqual({ lane: 0, lanes: 1 });
    });

    it("puts overlapping events side by side", () => {
        const layout = layoutDay([
            { id: "a", start: at(9), end: at(10) },
            { id: "b", start: at(9.5), end: at(11) },
            { id: "c", start: at(9.75), end: at(10.25) },
        ]);
        expect(layout.get("a")).toEqual({ lane: 0, lanes: 3 });
        expect(layout.get("b")).toEqual({ lane: 1, lanes: 3 });
        expect(layout.get("c")).toEqual({ lane: 2, lanes: 3 });
    });

    it("reuses a lane once it frees up and keeps the cluster's width", () => {
        const layout = layoutDay([
            { id: "long", start: at(8), end: at(12) },
            { id: "first", start: at(8), end: at(9) },
            { id: "second", start: at(10), end: at(11) },
        ]);
        expect(layout.get("long")).toEqual({ lane: 0, lanes: 2 });
        expect(layout.get("first")).toEqual({ lane: 1, lanes: 2 });
        expect(layout.get("second")).toEqual({ lane: 1, lanes: 2 });
    });

    it("starts a new cluster after a gap", () => {
        const layout = layoutDay([
            { id: "a", start: at(8), end: at(9) },
            { id: "b", start: at(8.5), end: at(9.5) },
            { id: "c", start: at(13), end: at(14) },
        ]);
        expect(layout.get("c")).toEqual({ lane: 0, lanes: 1 });
        expect(layout.get("a")?.lanes).toBe(2);
    });

    it("handles input in any order and zero-length events", () => {
        const layout = layoutDay([
            { id: "b", start: at(9), end: at(9) },
            { id: "a", start: at(9), end: at(10) },
        ]);
        expect(layout.get("a")).toEqual({ lane: 0, lanes: 2 });
        expect(layout.get("b")).toEqual({ lane: 1, lanes: 2 });
    });
});
