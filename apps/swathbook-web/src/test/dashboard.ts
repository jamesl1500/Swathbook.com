/**
 * Shared pieces for testing dashboard server actions.
 */
import { vi } from "vitest";

export const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";

/** The form an action receives: `businessId` plus `fields` (an array becomes repeated entries). */
export function form(fields: Record<string, string | string[] | File> = {}) {
    const data = new FormData();
    data.set("businessId", BUSINESS_ID);
    for (const [key, value] of Object.entries(fields)) {
        for (const item of [value].flat()) data.append(key, item);
    }
    return data;
}

/**
 * A stand-in for `@/libs/dashboard`, where `authorizeBusiness` resolves to `auth()`:
 *
 *     vi.mock("@/libs/dashboard", async () => (await import("@/test/dashboard")).mockDashboard(() => state.auth));
 */
export function mockDashboard(auth: () => unknown) {
    return {
        authorizeBusiness: vi.fn(async () => auth()),
        isFailure: (value: unknown) => typeof value === "object" && value !== null && "error" in value,
    };
}
