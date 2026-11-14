import { describe, expect, it } from "vitest";
import { trades } from "./content";
import { directoryFaqs, directoryTrades, findDirectoryTrade } from "./directory";

describe("directory trades", () => {
    it("covers every trade a business can pick", () => {
        expect(directoryTrades.map((trade) => trade.id)).toEqual(trades.map((trade) => trade.id));
    });

    it("has URL-safe, unique ids and distinct headings", () => {
        const ids = directoryTrades.map((trade) => trade.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
        const headings = directoryTrades.map((trade) => trade.heading);
        expect(new Set(headings).size).toBe(headings.length);
    });

    it("keeps intros short enough for a meta description", () => {
        for (const trade of directoryTrades) expect(trade.intro.length).toBeLessThanOrEqual(160);
    });

    it("finds trades by id", () => {
        expect(findDirectoryTrade("lawn-care")?.pro).toBe("lawn care pro");
        expect(findDirectoryTrade("nope")).toBeNull();
        expect(findDirectoryTrade(null)).toBeNull();
    });

    it("phrases the FAQs for the trade", () => {
        expect(directoryFaqs(findDirectoryTrade("plumbing"))[0].question).toBe("How do I book a plumber on Swathbook?");
        expect(directoryFaqs(null)[0].question).toBe("How do I book a local pro on Swathbook?");
    });
});
