import { timingSafeEqual } from "node:crypto";
import { emailBaseUrl, processNotifications } from "@/libs/email/worker";
import { sendFeedbackDigest } from "@/libs/feedback";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";

/**
 * Minute-by-minute housekeeping, called by pg_cron (see the
 * notifications_team migration) or any scheduler with CRON_SECRET:
 * releases unpaid deposit holds, sends due emails, and emails the team any
 * new product feedback.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !hasAdminClient()) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: released } = await admin.rpc("release_expired_holds");
  const result = await processNotifications(admin, { limit: 50 });
  // New product feedback goes to the team in one email.
  const feedback = await sendFeedbackDigest(admin, { baseUrl: emailBaseUrl() });
  return Response.json({ released: released ?? 0, ...result, feedback: feedback.sent });
}

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const GET = handle;
export const POST = handle;
