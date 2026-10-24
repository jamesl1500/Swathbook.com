"use client";

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { LoaderCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";

/**
 * Stripe Payment Element for a direct charge on a business's connected
 * account (that's why stripeAccount is passed to loadStripe).
 */
export function PaymentForm({
  clientSecret,
  stripeAccountId,
  amountLabel,
  returnUrl,
  brandColor,
}: {
  clientSecret: string;
  stripeAccountId: string;
  amountLabel: string;
  returnUrl: string;
  brandColor?: string | null;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey, { stripeAccount: stripeAccountId }) : null),
    [publishableKey, stripeAccountId],
  );

  if (!stripePromise) {
    return <FormMessage>Online payments aren&apos;t set up on this site yet. The business will collect payment in person.</FormMessage>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: brandColor ?? "#1c3d70",
            colorBackground: "#fffdfa",
            colorText: "#14202e",
            borderRadius: "12px",
            fontFamily: "system-ui, sans-serif",
          },
        },
      }}
    >
      <CheckoutForm amountLabel={amountLabel} returnUrl={returnUrl} />
    </Elements>
  );
}

function CheckoutForm({ amountLabel, returnUrl }: { amountLabel: string; returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
    // Only reached on an immediate error; success redirects to returnUrl.
    setError(result.error?.message ?? "The payment didn't go through. Please try again.");
    setSubmitting(false);
  }

  return (
    <form onSubmit={pay} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button type="submit" size="lg" className="w-full" disabled={!stripe || submitting}>
        {submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
        {submitting ? "Processing…" : `Pay ${amountLabel}`}
      </Button>
      <p className="text-center text-xs text-ink-faint">Payments are processed securely by Stripe.</p>
    </form>
  );
}
