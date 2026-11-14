import { getStripe, hasStripe } from "@/libs/stripe/server";
import { handleStripeEvent, type ThinEvent } from "@/libs/stripe/webhooks";
import { createAdminClient } from "@/libs/supabase/admin";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";

/**
 * Stripe event destinations (thin events). Account events come from the platform
 * and payment events from connected accounts, which in the Dashboard are two
 * destinations with their own signing secrets, so STRIPE_WEBHOOK_SECRET takes a
 * comma-separated list. Subscribe them to SUBSCRIBED_EVENTS (libs/stripe/webhooks.ts).
 */
export async function POST(request: Request) {
  const secrets = webhookSecrets();
  if (!hasStripe() || !secrets.length) {
    // Logged because a rejected webhook is otherwise silent on this side.
    console.warn("[stripe] webhook rejected: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET isn't set");
    return new Response("Stripe isn't configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await request.text();
  const event = verify(body, signature, secrets);
  if (!event) {
    // Usually the wrong secret: `stripe listen` prints its own whsec_, separate from the Dashboard's.
    console.warn(`[stripe] webhook rejected: the signature matched none of the ${secrets.length} STRIPE_WEBHOOK_SECRET value(s)`);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(getStripe(), createAdminClient(), event);
    // A paid deposit confirms the booking, which queues the customer's confirmation.
    sendQueuedEmailsSoon();
    return Response.json({ received: true, outcome });
  } catch (error) {
    console.error(`[stripe] ${event.type} ${event.id} failed`, error);
    // 500 tells Stripe to retry with backoff.
    return new Response("Processing failed", { status: 500 });
  }
}

function webhookSecrets() {
  return (process.env.STRIPE_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
}

function verify(body: string, signature: string, secrets: string[]): ThinEvent | null {
  for (const secret of secrets) {
    try {
      return getStripe().parseEventNotification(body, signature, secret) as unknown as ThinEvent;
    } catch {
      // Signed by the other destination's secret (or forged); try the next one.
    }
  }
  return null;
}
