import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Check, CircleAlert, PauseCircle, Sparkles } from "lucide-react";
import { Card, CardTitle, ManagersOnly, PageHeader } from "@/components/app/ui";
import { FormMessage } from "@/components/ui/field";
import { loadBilling } from "@/libs/billing/load";
import { PLANS, TRIAL_DAYS, type PaidPlan } from "@/libs/billing/plans";
import type { BillingState } from "@/libs/billing/status";
import { requireBusinessContext } from "@/libs/dashboard";
import { routes } from "@/libs/routes";
import { hasStripe } from "@/libs/stripe/server";
import { createClient } from "@/libs/supabase/server";
import { formatDateLong, toDateKey } from "@/libs/time";
import { cn, formatCents } from "@/libs/utils";
import { ChoosePlanButton, ManageBillingButton } from "./billing-forms";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  return (
    <>
      <PageHeader title="Billing" description="Your Swathbook plan. Customer payments and payouts are under Payouts." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
        <Billing searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Billing({ searchParams }: { searchParams: PageProps<"/dashboard/billing">["searchParams"] }) {
  const { business, canManage, role } = await requireBusinessContext(routes.billing);
  if (!canManage) return <ManagersOnly what="billing" />;

  const supabase = await createClient();
  const [{ state, subscription, seats }, { checkout }] = await Promise.all([loadBilling(supabase, business), searchParams]);
  const isOwner = role === "owner";
  const configured = hasStripe();
  const currentPlan = state.kind === "active" || state.kind === "past_due" ? state.plan : null;
  const tz = business.timezone;

  return (
    <div className="space-y-6">
      {checkout === "success" ? (
        <FormMessage tone="success">
          {subscription ? "Thanks! Your plan is set." : "Thanks! We're finishing up with Stripe. This page updates in a moment."}
        </FormMessage>
      ) : null}
      {!configured ? <FormMessage tone="info">Billing isn&apos;t configured yet. Add your Stripe keys to let owners subscribe.</FormMessage> : null}

      <StatusCard state={state} timeZone={tz} businessId={business.id} isOwner={isOwner && configured} hasCustomer={Boolean(business.stripe_customer_id)} />

      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="mb-3 text-lg font-bold">
          {currentPlan ? "Plans" : "Pick a plan"}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(PLANS) as PaidPlan[]).map((plan) => {
            const config = PLANS[plan];
            const isCurrent = currentPlan === plan;
            return (
              <Card key={plan} className={cn("flex flex-col", plan === "crew" && "border-brand-600")} data-testid={`plan-${plan}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold">{config.name}</h3>
                  {isCurrent ? <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">Current plan</span> : null}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{config.summary}</p>
                <p className="mt-4 font-display text-3xl font-extrabold">
                  {formatCents(config.priceCents, "usd")}
                  <span className="ml-1 text-sm font-semibold text-ink-soft">/ month</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {config.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {!isOwner || !configured ? null : currentPlan ? (
                    isCurrent ? null : <ManageBillingButton businessId={business.id} label={`Switch to ${config.name}`} />
                  ) : (
                    <ChoosePlanButton
                      businessId={business.id}
                      plan={plan}
                      highlighted={plan === "crew"}
                      label={state.kind === "trial" ? `Choose ${config.name}` : `Subscribe to ${config.name}`}
                    />
                  )}
                </div>
              </Card>
            );
          })}
          <Card className="flex flex-col">
            <h3 className="text-lg font-bold">Fleet</h3>
            <p className="mt-1 text-sm text-ink-soft">Several crews or locations, unlimited team members.</p>
            <p className="mt-4 font-display text-3xl font-extrabold">Let&apos;s talk</p>
            <p className="mt-4 flex-1 text-sm text-ink-soft">We&apos;ll set up a plan, help import your customers and get your crews running.</p>
            <Link href={routes.contact} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong px-5 text-sm font-semibold hover:border-ink-soft">
              Contact sales
            </Link>
          </Card>
        </div>
        {!isOwner ? <p className="mt-3 text-sm text-ink-soft">Only the business owner can change the plan.</p> : null}
      </section>

      <Card>
        <CardTitle>Team seats</CardTitle>
        <p className="text-ink-soft">
          <strong className="text-ink">{seats.used}</strong> {seats.limit === null ? "people on the team (no limit on your plan)" : `of ${seats.limit} seats used`}, including
          you and pending invites. <Link href={routes.team} className="font-semibold text-brand-600 underline underline-offset-4">Manage your team</Link>
        </p>
      </Card>
    </div>
  );
}

function StatusCard({
  state,
  timeZone,
  businessId,
  isOwner,
  hasCustomer,
}: {
  state: BillingState;
  timeZone: string;
  businessId: string;
  isOwner: boolean;
  hasCustomer: boolean;
}) {
  const date = (iso: string | null) => (iso ? formatDateLong(toDateKey(new Date(iso), timeZone)) : "");
  const manage = isOwner && hasCustomer ? <ManageBillingButton businessId={businessId} /> : null;

  if (state.kind === "trial") {
    return (
      <Card className="border-brand-200 bg-brand-50" data-testid="billing-status">
        <p className="flex items-center gap-2 font-bold">
          <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
          Free trial · {state.daysLeft} {state.daysLeft === 1 ? "day" : "days"} left
        </p>
        <p className="mt-2 text-ink-soft">
          Everything is on for {TRIAL_DAYS} days, no card needed. Your booking page stays live until {date(state.endsAt)}. Pick a plan any time: you
          won&apos;t be charged until the trial ends.
        </p>
      </Card>
    );
  }
  if (state.kind === "active") {
    return (
      <Card data-testid="billing-status">
        <p className="flex items-center gap-2 font-bold">
          <Check className="size-5 text-brand-600" aria-hidden="true" />
          {state.plan ? PLANS[state.plan as PaidPlan]?.name ?? "Fleet" : "Your"} plan is active
        </p>
        <p className="mt-2 text-ink-soft">
          {state.cancelsAtPeriodEnd
            ? `It ends on ${date(state.renewsAt)}. Your booking page pauses then unless you renew.`
            : state.renewsAt
              ? `Renews on ${date(state.renewsAt)}.`
              : "Thanks for being a customer."}
        </p>
        {manage ? <div className="mt-4">{manage}</div> : null}
      </Card>
    );
  }
  if (state.kind === "past_due") {
    return (
      <Card className="border-sun bg-sun-soft" data-testid="billing-status">
        <p className="flex items-center gap-2 font-bold">
          <CircleAlert className="size-5 text-clay" aria-hidden="true" />
          Your last payment didn&apos;t go through
        </p>
        <p className="mt-2 text-ink">Update your card to keep your booking page live. Stripe will retry automatically.</p>
        {manage ? <div className="mt-4">{manage}</div> : null}
      </Card>
    );
  }
  return (
    <Card className="border-clay/40 bg-clay-soft" data-testid="billing-status">
      <p className="flex items-center gap-2 font-bold text-clay-ink">
        <PauseCircle className="size-5" aria-hidden="true" />
        Your booking page is paused
      </p>
      <p className="mt-2 text-ink">
        {state.reason === "trial_ended" ? "Your free trial has ended." : state.reason === "unpaid" ? "Your plan is unpaid." : "Your plan has ended."}{" "}
        Customers can&apos;t book until you pick a plan. Your schedule, customers and history are all still here.
      </p>
      {manage ? <div className="mt-4">{manage}</div> : null}
    </Card>
  );
}
