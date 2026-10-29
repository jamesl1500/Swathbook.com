"use client";

import { useState, useTransition } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";
import { PaymentForm } from "@/components/booking/payment-form";
import { FormMessage } from "@/components/ui/field";
import type { PaymentKind, PaymentSession } from "@/libs/stripe/payments";
import { brandTextColor, formatCents } from "@/libs/utils";
import { startPayment } from "./actions";

export function PayButton({
  token,
  kind,
  amountCents,
  currency,
  brandColor,
}: {
  token: string;
  kind: PaymentKind;
  amountCents: number;
  currency: string;
  brandColor: string;
}) {
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (session) {
    return (
      <PaymentForm
        clientSecret={session.clientSecret}
        stripeAccountId={session.stripeAccountId}
        amountLabel={formatCents(session.amountCents, currency)}
        returnUrl={`${window.location.origin}/booking/${token}?paid=1`}
        brandColor={brandColor}
      />
    );
  }

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startPayment(token, kind);
            if ("error" in result) setError(result.error);
            else setSession(result);
          })
        }
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 font-semibold disabled:opacity-60"
        style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
        {kind === "deposit" ? "Pay deposit" : "Pay balance"} · {formatCents(amountCents, currency)}
      </button>
    </div>
  );
}
