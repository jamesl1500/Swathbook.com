import Link from "next/link";
import { Check } from "lucide-react";
import { routes } from "@/libs/routes";
import { buttonStyles } from "@/components/ui/button";
import { CARD_PROCESSING, SWATHBOOK_FEE_LABEL, estimateTakeHome } from "@/libs/billing/fees";
import { pricingOffer } from "@/libs/marketing/content";
import { formatCents } from "@/libs/utils";

/** The worked example: a $200 job paid in full by card. */
const EXAMPLE_JOB_CENTS = 20_000;

/** Swathbook's one price, with what a business keeps on a typical job. */
export function PricingCards() {
  const example = estimateTakeHome(EXAMPLE_JOB_CENTS);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col rounded-[1.75rem] border border-brand-700 bg-brand-700 p-7 text-paper shadow-lift sm:p-9" data-testid="pricing-offer">
        <h3 className="font-display text-xl font-bold">{pricingOffer.name}</h3>
        <p className="mt-1 text-sm text-paper/70">{pricingOffer.description}</p>
        <p className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-6xl font-extrabold tracking-tight">{SWATHBOOK_FEE_LABEL}</span>
          <span className="text-paper/80">of each payment you take. No monthly fee.</span>
        </p>
        <ul className="mt-7 grid flex-1 gap-3 text-[0.95rem] sm:grid-cols-2">
          {pricingOffer.features.map((feature) => (
            <li key={feature} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-sky" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
        <Link href={routes.signup} className={buttonStyles({ variant: "accent", className: "mt-8 w-full sm:w-auto sm:self-start" })}>
          {pricingOffer.cta}
        </Link>
      </div>

      <div className="flex flex-col rounded-[1.75rem] border border-line bg-card p-7 sm:p-9">
        <h3 className="font-display text-xl font-bold">On a {formatCents(EXAMPLE_JOB_CENTS)} job</h3>
        <p className="mt-1 text-sm text-ink-soft">Paid by card through your booking link.</p>
        <dl className="mt-6 space-y-3 text-[0.95rem]">
          <ExampleRow label="Your customer pays" value={formatCents(example.priceCents)} />
          <ExampleRow label={`Swathbook (${SWATHBOOK_FEE_LABEL})`} value={`−${formatCents(example.swathbookFeeCents)}`} />
          <ExampleRow label={`Card processing (${CARD_PROCESSING.label})`} value={`−${formatCents(example.processingCents)}`} />
          <div className="border-t border-line pt-3">
            <ExampleRow label="You keep" value={formatCents(example.takeHomeCents)} strong />
          </div>
        </dl>
        <p className="mt-auto pt-6 text-sm text-ink-faint">
          Card processing goes to Stripe, our payment partner, at its standard US rate. Cash jobs cost nothing, and refunds return our fee.
        </p>
      </div>
    </div>
  );
}

function ExampleRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold" : "text-ink-soft"}>{label}</dt>
      <dd className={strong ? "font-display text-2xl font-extrabold text-brand-700" : "font-semibold tabular-nums"}>{value}</dd>
    </div>
  );
}
