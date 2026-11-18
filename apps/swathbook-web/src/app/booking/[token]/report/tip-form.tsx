"use client";

import { useState, useTransition } from "react";
import { HandHeart, LoaderCircle } from "lucide-react";
import { PaymentForm } from "@/components/booking/payment-form";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { PaymentSession } from "@/libs/stripe/payments";
import { brandTextColor, cn, formatCents } from "@/libs/utils";
import { startPayment } from "../actions";

/** Pick a tip (a suggestion or your own amount), then pay it like any other payment. */
export function TipForm({
  token,
  currency,
  brandColor,
  suggestions,
  minCents,
  maxCents,
  crewName,
}: {
  token: string;
  currency: string;
  brandColor: string;
  suggestions: Array<{ label: string | null; cents: number }>;
  minCents: number;
  maxCents: number;
  crewName: string | null;
}) {
  const [choice, setChoice] = useState<number | "custom">(suggestions[1]?.cents ?? suggestions[0].cents);
  const [custom, setCustom] = useState("");
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const customCents = Math.round(Number(custom.replace(/[$,\s]/g, "")) * 100);
  const amount = choice === "custom" ? customCents : choice;
  const valid = Number.isInteger(amount) && amount >= minCents && amount <= maxCents;

  if (session) {
    return (
      <PaymentForm
        clientSecret={session.clientSecret}
        stripeAccountId={session.stripeAccountId}
        amountLabel={formatCents(session.amountCents, currency)}
        returnUrl={`${window.location.origin}/booking/${token}/report?paid=1`}
        brandColor={brandColor}
      />
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setError(`Pick an amount between ${formatCents(minCents, currency)} and ${formatCents(maxCents, currency)}.`);
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await startPayment(token, "tip", amount);
          if ("error" in result) setError(result.error);
          else setSession(result);
        });
      }}
    >
      <p className="text-sm text-ink-soft">{crewName ? `Your tip goes to ${crewName} and the team.` : "Your tip goes to the team."}</p>
      <fieldset>
        <legend className="sr-only">Tip amount</legend>
        <div className="grid grid-cols-4 gap-2">
          {suggestions.map((suggestion) => (
            <TipOption
              key={suggestion.cents}
              checked={choice === suggestion.cents}
              onSelect={() => setChoice(suggestion.cents)}
              brandColor={brandColor}
              title={formatCents(suggestion.cents, currency)}
              subtitle={suggestion.label}
            />
          ))}
          <TipOption checked={choice === "custom"} onSelect={() => setChoice("custom")} brandColor={brandColor} title="Other" subtitle={null} />
        </div>
      </fieldset>
      {choice === "custom" ? (
        <Field label="Tip amount" htmlFor="tip-amount">
          <div className="relative max-w-40">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">$</span>
            <Input id="tip-amount" inputMode="decimal" value={custom} onChange={(event) => setCustom(event.target.value)} className="pl-7" autoFocus />
          </div>
        </Field>
      ) : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      <button
        type="submit"
        disabled={pending || (choice === "custom" && !custom)}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 font-semibold disabled:opacity-60"
        style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <HandHeart className="size-4" aria-hidden="true" />}
        {valid ? `Tip ${formatCents(amount, currency)}` : "Leave a tip"}
      </button>
    </form>
  );
}

function TipOption({
  checked,
  onSelect,
  brandColor,
  title,
  subtitle,
}: {
  checked: boolean;
  onSelect: () => void;
  brandColor: string;
  title: string;
  subtitle: string | null;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2 text-center has-focus-visible:ring-3 has-focus-visible:ring-brand-200",
        checked ? "border-transparent" : "border-line bg-card hover:border-ink-faint",
      )}
      style={checked ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
    >
      <input type="radio" name="tip" className="sr-only" checked={checked} onChange={onSelect} />
      <span className="font-display text-lg font-bold leading-tight">{title}</span>
      {subtitle ? <span className="text-xs opacity-80">{subtitle}</span> : null}
    </label>
  );
}
