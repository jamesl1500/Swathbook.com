import Link from "next/link";
import { Check } from "lucide-react";
import { routes } from "@/libs/routes";
import { buttonStyles } from "@/components/ui/button";
import { CARD_PROCESSING, SWATHBOOK_FEE_LABEL, estimateTakeHome } from "@/libs/billing/fees";
import { formatCents } from "@/libs/utils";

/** The worked example: a $200 job paid in full by card. */
const EXAMPLE_JOB_CENTS = 20_000;

const FEE_POINTS = [
  "Deposits and balances paid by card",
  "Taken before the payout, never billed",
  "Same rate on every plan",
  "Tips go to you in full",
  "Cash jobs cost nothing",
  "Refund a customer and our fee is refunded too",
];

/**
 * The 1.25% payment fee every plan pays, beside what a business keeps on a
 * typical job. Shown under the monthly plans.
 */
export function PaymentFeeCards() {
  const example = estimateTakeHome(EXAMPLE_JOB_CENTS);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-testid="payment-fee">
      <div className="flex flex-col rounded-[1.75rem] border border-brand-700 bg-brand-700 p-7 text-paper shadow-lift sm:p-9">
        <h3 className="font-display text-xl font-bold">Plus a small fee when you get paid</h3>
        <p className="mt-1 text-sm text-paper/70">On every plan, from one truck to a fleet.</p>
        <p className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-6xl font-extrabold tracking-tight">{SWATHBOOK_FEE_LABEL}</span>
          <span className="text-paper/80">of each customer payment through your booking link.</span>
        </p>
        <ul className="mt-7 grid flex-1 gap-3 text-[0.95rem] sm:grid-cols-2">
          {FEE_POINTS.map((point) => (
            <li key={point} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-sky" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <Link href={routes.signup} className={buttonStyles({ variant: "accent", className: "mt-8 w-full sm:w-auto sm:self-start" })}>
          Start free trial
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
          Card processing goes to Stripe, our payment partner, at its standard US rate. Your monthly plan is billed separately.
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
