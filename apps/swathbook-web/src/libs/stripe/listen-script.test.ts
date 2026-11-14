// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUBSCRIBED_EVENTS } from "./webhooks";

/**
 * `pnpm stripe:listen` (repo root) forwards Stripe events to the local app.
 * If its list drifts from what the webhook handles, local testing silently
 * misses events, so the two must match exactly.
 */
describe("pnpm stripe:listen", () => {
    const rootPackage = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../package.json"), "utf8")) as { scripts: Record<string, string> };
    const script = rootPackage.scripts["stripe:listen"];

    it("forwards exactly the events the webhook handles", () => {
        const listed = /--thin-events "([^"]+)"/.exec(script)?.[1].split(",");
        expect(listed?.toSorted()).toEqual([...SUBSCRIBED_EVENTS].toSorted());
    });

    it("forwards platform and connected-account events to the webhook route", () => {
        expect(script).toContain("--forward-thin-to localhost:3000/api/stripe/webhook");
        expect(script).toContain("--forward-thin-connect-to localhost:3000/api/stripe/webhook");
    });
});
