import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Card, CardTitle, ManagersOnly, PageHeader } from "@/components/app/ui";
import { FormMessage } from "@/components/ui/field";
import { CARD_PROCESSING, SWATHBOOK_FEE_LABEL, estimateTakeHome } from "@/libs/billing/fees";
import { FEE_SUMMARY_DAYS, loadBilling } from "@/libs/billing/load";
import { LEGACY_PLANS, isPaidPlan } from "@/libs/billing/plans";
import { requireBusinessContext } from "@/libs/dashboard";
import { routes } from "@/libs/routes";
import { hasStripe } from "@/libs/stripe/server";
import { createClient } from "@/libs/supabase/server";
import { formatDateLong, toDateKey } from "@/libs/time";
import { formatCents } from "@/libs/utils";
import { ManageBillingButton } from "./billing-forms";

export const metadata: Metadata = { title: "Billing" };

/** The worked example on the page: a $200 job paid in full by card. */
const EXAMPLE_JOB_CENTS = 20_000;

const INCLUDED = [
  "No monthly fee, no setup fee, no contract",
  "Every feature, for every business",
  "As many team members as you need",
  "Tips go to you in full",
  "Refund a customer and our fee is refunded too",
];

export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" description="What Swathbook charges. Customer payments and payouts are under Payouts." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
        <Billing />
      </Suspense>
    </>
  );
}

async function Billing() {
  const { business, canManage, role } = await requireBusinessContext(routes.billing);
  if (!canManage) return <ManagersOnly what="billing" />;

  const supabase = await createClient();
  const [{ fees, legacyPlan }, { data: account }] = await Promise.all([
    loadBilling(supabase, business),
    supabase.from("stripe_connect_accounts").select("charges_enabled").eq("business_id", business.id).maybeSingle(),
  ]);
  const currency = business.currency;
  const example = estimateTakeHome(EXAMPLE_JOB_CENTS);

  return (
    <div className="space-y-6">
      {legacyPlan ? (
        <LegacyPlanCard
          plan={legacyPlan}
          timeZone={business.timezone}
          businessId={business.id}
          isOwner={role === "owner"}
          canCancel={role === "owner" && hasStripe() && Boolean(business.stripe_customer_id)}
        />
      ) : null}

      <Card data-testid="billing-status">
        <p className="label-tag text-brand-600">Your price</p>
        <p className="mt-2 font-display text-4xl font-extrabold tracking-tight">{SWATHBOOK_FEE_LABEL} per payment</p>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Swathbook takes {SWATHBOOK_FEE_LABEL} of each deposit and balance your customers pay through your booking page. It comes out before
          the payout, so there&apos;s no bill to pay. If you&apos;re not paid, we&apos;re not paid.
        </p>
        <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>On a {formatCents(EXAMPLE_JOB_CENTS, currency)} job</CardTitle>
          <dl className="space-y-2 text-sm">
            <Row label="Customer pays" value={formatCents(example.priceCents, currency)} />
            <Row label={`Swathbook (${SWATHBOOK_FEE_LABEL})`} value={`−${formatCents(example.swathbookFeeCents, currency)}`} />
            <Row label={`Card processing (about ${CARD_PROCESSING.label})`} value={`−${formatCents(example.processingCents, currency)}`} />
            <div className="border-t border-line pt-2">
              <Row label="You keep" value={formatCents(example.takeHomeCents, currency)} strong />
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            Processing is Stripe&apos;s, paid to Stripe, and varies by card. Each service shows what you keep on the{" "}
            <Link href={routes.services} className="font-semibold text-brand-600 underline underline-offset-4">
              Services
            </Link>{" "}
            page.
          </p>
        </Card>

        <Card data-testid="fee-summary">
          <CardTitle>Last {FEE_SUMMARY_DAYS} days</CardTitle>
          <dl className="space-y-2 text-sm">
            <Row label={`Paid through Swathbook (${fees.payments} ${fees.payments === 1 ? "payment" : "payments"})`} value={formatCents(fees.collectedCents, currency)} />
            <Row label="Swathbook fees" value={formatCents(fees.feeCents, currency)} strong />
          </dl>
          <p className="mt-3 text-xs text-ink-faint">After refunds. Every fee is also listed with its payment in your Stripe dashboard.</p>
          {!account?.charges_enabled ? (
            <div className="mt-4 space-y-3">
              <FormMessage tone="info">You&apos;re not taking card payments yet, so there&apos;s nothing to pay.</FormMessage>
              <Link
                href={routes.payouts}
                className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold hover:border-ink-soft"
              >
                Set up payouts to take deposits online
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold text-ink" : "text-ink-soft"}>{label}</dt>
      <dd className={strong ? "font-display text-lg font-extrabold" : "font-semibold tabular-nums"}>{value}</dd>
    </div>
  );
}

function LegacyPlanCard({
  plan,
  timeZone,
  businessId,
  isOwner,
  canCancel,
}: {
  plan: { plan: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean };
  timeZone: string;
  businessId: string;
  isOwner: boolean;
  canCancel: boolean;
}) {
  const name = isPaidPlan(plan.plan) ? LEGACY_PLANS[plan.plan].name : "monthly";
  const endsOn = plan.current_period_end ? formatDateLong(toDateKey(new Date(plan.current_period_end), timeZone)) : null;
  return (
    <Card className="border-sun bg-sun-soft" data-testid="legacy-plan">
      <p className="flex items-center gap-2 font-bold">
        <CircleAlert className="size-5 text-clay" aria-hidden="true" />
        {plan.cancel_at_period_end ? `Your old ${name} plan is cancelled` : `You still have the ${name} monthly plan`}
      </p>
      <p className="mt-2 text-ink">
        {plan.cancel_at_period_end
          ? `It ends${endsOn ? ` on ${endsOn}` : ""} and you won't be billed for it again.`
          : "Swathbook doesn't charge a monthly fee any more, so you don't need it. Cancel it so you're not billed again; nothing else changes."}
      </p>
      {!plan.cancel_at_period_end && canCancel ? (
        <div className="mt-4">
          <ManageBillingButton businessId={businessId} label="Cancel the old plan" />
        </div>
      ) : null}
      {!plan.cancel_at_period_end && !isOwner ? <p className="mt-3 text-sm text-ink-soft">Only the business owner can cancel it.</p> : null}
    </Card>
  );
}
