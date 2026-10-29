import { timingSafeEqual } from "node:crypto";
import { processNotifications } from "@/libs/email/worker";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";

/**
 * Minute-by-minute housekeeping, called by pg_cron (see the
 * notifications_team migration) or any scheduler with CRON_SECRET:
 * releases unpaid deposit holds, then sends due emails.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !hasAdminClient()) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: released } = await admin.rpc("release_expired_holds");
  const result = await processNotifications(admin, { limit: 50 });
  return Response.json({ released: released ?? 0, ...result });
}

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const GET = handle;
export const POST = handle;
