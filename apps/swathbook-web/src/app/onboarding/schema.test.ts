// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, onboardingSchema, slugField, type OnboardingInput } from "./schema";

const valid: OnboardingInput = {
    businessName: "Green Acres",
    trade: "lawn-care",
    phone: "",
    slug: "green-acres",
    services: [{ name: "Weekly mow", price: 45, durationMinutes: 60, depositPercent: 0 }],
    baseAddress: "1 Main St, Austin",
    serviceRadiusMiles: 15,
    workDays: [1, 2, 3, 4, 5],
    dayStart: "08:00",
    dayEnd: "17:00",
};

function issuesAt(input: unknown) {
    const result = onboardingSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("slugField", () => {
    it.each(["green-acres", "abc", "a1-b2", "x".repeat(40)])("accepts %s", (slug) => {
        expect(slugField.safeParse(slug).success).toBe(true);
    });

    it.each([
        ["too short", "ab"],
        ["too long", "x".repeat(41)],
        ["leading dash", "-green"],
        ["trailing dash", "green-"],
        ["spaces", "green acres"],
        ["symbols", "green_acres!"],
        ["reserved app route", "dashboard"],
        ["reserved brand", "swathbook"],
    ])("rejects %s", (_label, slug) => {
        expect(slugField.safeParse(slug).success).toBe(false);
    });

    it("lowercases before validating", () => {
        expect(slugField.parse("Green-Acres")).toBe("green-acres");
    });
});

describe("onboardingSchema", () => {
    it("accepts a complete setup", () => {
        expect(onboardingSchema.safeParse(valid).success).toBe(true);
    });

    it("requires at least one service", () => {
        expect(issuesAt({ ...valid, services: [] })).toContain("services");
    });

    it("validates each service", () => {
        const services = [{ name: "", price: Number.NaN, durationMinutes: 60, depositPercent: 0 }];
        expect(issuesAt({ ...valid, services })).toEqual(expect.arrayContaining(["services.0.name", "services.0.price"]));
    });

    it("requires at least one work day", () => {
        expect(issuesAt({ ...valid, workDays: [] })).toContain("workDays");
    });

    it("requires the day to end after it starts", () => {
        expect(issuesAt({ ...valid, dayStart: "17:00", dayEnd: "08:00" })).toEqual(["dayEnd"]);
    });

    it("requires a trade and an address", () => {
        expect(issuesAt({ ...valid, trade: "", baseAddress: "" })).toEqual(expect.arrayContaining(["trade", "baseAddress"]));
    });
});

describe("reserved booking links", () => {
    it("blocks names that would look official", () => {
        for (const slug of ["support", "admin", "swathbook", "Billing"]) {
            expect(slugField.safeParse(slug).success, slug).toBe(false);
        }
        expect(slugField.safeParse("support-squad").success).toBe(true);
    });

    it("matches the database's list exactly", () => {
        const migrations = path.resolve(__dirname, "../../../../../supabase/migrations");
        const file = readdirSync(migrations).find((name) => name.endsWith("_booking_link_prefix.sql"))!;
        const sql = readFileSync(path.join(migrations, file), "utf8");
        const body = sql.slice(sql.indexOf("any(array["), sql.indexOf("]);", sql.indexOf("any(array[")));
        const inDatabase = [...body.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]).sort();
        expect(inDatabase).toEqual([...RESERVED_SLUGS].sort());
    });
});
