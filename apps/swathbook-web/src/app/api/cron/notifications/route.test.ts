// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processNotifications = vi.hoisted(() => vi.fn(async () => ({ claimed: 2, sent: 2, skipped: 0, failed: 0 })));
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 1, error: null })));
vi.mock("@/libs/email/worker", () => ({ processNotifications }));
vi.mock("@/libs/supabase/admin", () => ({ hasAdminClient: () => true, createAdminClient: () => ({ rpc }) }));

import { GET, POST } from "./route";

const call = (handler: typeof GET, auth?: string) =>
    handler(new Request("http://localhost/api/cron/notifications", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => vi.stubEnv("CRON_SECRET", "s3cret-value"));
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/notifications", () => {
    it("releases expired holds and sends due emails", async () => {
        const response = await call(POST, "Bearer s3cret-value");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ released: 1, claimed: 2, sent: 2, skipped: 0, failed: 0 });
        expect(rpc).toHaveBeenCalledWith("release_expired_holds");
    });

    it("rejects a missing or wrong secret", async () => {
        expect((await call(GET)).status).toBe(401);
        expect((await call(GET, "Bearer nope")).status).toBe(401);
    });

    it("is off until CRON_SECRET is set", async () => {
        vi.stubEnv("CRON_SECRET", "");
        expect((await call(GET, "Bearer ")).status).toBe(503);
    });
});
