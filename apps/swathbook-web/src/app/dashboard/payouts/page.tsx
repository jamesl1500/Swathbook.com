import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck, Banknote, CircleAlert, Landmark, ShieldCheck } from "lucide-react";
import { Card, CardTitle, ManagersOnly, PageHeader, Stat } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { routes } from "@/libs/routes";
import { getStripe, hasStripe } from "@/libs/stripe/server";
import { createClient } from "@/libs/supabase/server";
import { formatDateTime } from "@/libs/time";
import { formatCents } from "@/libs/utils";
import { PayoutActions } from "./payout-actions";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage({ searchParams }: PageProps<"/dashboard/payouts">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Payouts searchParams={searchParams} />
    </Suspense>
  );
}

async function loadStripeSummary(accountId: string) {
  try {
    const stripe = getStripe();
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 5 }, { stripeAccount: accountId }),
    ]);
    const sum = (entries: Array<{ amount: number; currency: string }>) =>
      entries.filter((entry) => entry.currency === "usd").reduce((total, entry) => total + entry.amount, 0);
    return { available: sum(balance.available), pending: sum(balance.pending), payouts: payouts.data };
  } catch (error) {
    console.error("[payouts] summary failed", error);
    return null;
  }
}

async function Payouts({ searchParams }: { searchParams: PageProps<"/dashboard/payouts">["searchParams"] }) {
  const { business, canManage, role } = await requireBusinessContext(routes.payouts);
  if (!canManage) return <ManagersOnly what="payouts" />;
  const { onboarding } = await searchParams;

  const supabase = await createClient();
  const [{ data: account }, { data: payments }] = await Promise.all([
    supabase.from("stripe_connect_accounts").select("*").eq("business_id", business.id).maybeSingle(),
    supabase
      .from("payments")
      .select("id, kind, status, amount_cents, amount_refunded_cents, currency, succeeded_at, created_at, card_brand, card_last4, customers(full_name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stripeConfigured = hasStripe();
  const isOwner = role === "owner";
  const summary = stripeConfigured && account?.charges_enabled ? await loadStripeSummary(account.stripe_account_id) : null;

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Deposits and payments go straight to your bank through Stripe. Swathbook never holds your money."
      />

      {onboarding === "returned" && account && !account.charges_enabled ? (
        <div className="mb-6 rounded-2xl border border-sun/60 bg-sun-soft px-5 py-4 text-sm">
          Thanks! Stripe is reviewing your details. This usually takes a few minutes; we&apos;ll update this page automatically.
        </div>
      ) : null}

      {!stripeConfigured ? (
        <Card>
          <CardTitle>Payments aren&apos;t configured yet</CardTitle>
          <p className="text-ink-soft">
            Add <code className="rounded bg-paper-deep px-1.5 py-0.5 text-sm">STRIPE_SECRET_KEY</code>,{" "}
            <code className="rounded bg-paper-deep px-1.5 py-0.5 text-sm">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> and{" "}
            <code className="rounded bg-paper-deep px-1.5 py-0.5 text-sm">STRIPE_WEBHOOK_SECRET</code> to the server environment to turn on
            payouts. Until then, customers can still book without paying online.
          </p>
        </Card>
      ) : !account ? (
        <Card>
          <div className="flex flex-wrap items-start gap-6">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Landmark className="size-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold">Get paid when customers book</h2>
              <ul className="mt-3 space-y-2 text-ink-soft">
                <li className="flex gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
                  Collect deposits at booking and payments when the job&apos;s done.
                </li>
                <li className="flex gap-2">
                  <Banknote className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
                  Money lands in your bank on a rolling schedule, usually in 2 business days.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
                  Setup takes about 5 minutes on Stripe, our payments partner.
                </li>
              </ul>
              <div className="mt-5">
                {isOwner ? (
                  <PayoutActions businessId={business.id} mode="start" />
                ) : (
                  <p className="text-sm text-ink-faint">Only the business owner can connect a bank account.</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardTitle action={<PayoutActions businessId={business.id} mode="refresh" />}>Account status</CardTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusPill ok={account.charges_enabled} label="Taking payments" />
              <StatusPill ok={account.payouts_enabled} label="Payouts to bank" />
              <StatusPill ok={account.details_submitted} label="Details complete" />
            </div>
            {account.requirements_due.length ? (
              <div className="mt-5 rounded-xl border border-sun/60 bg-sun-soft p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <CircleAlert className="size-4" aria-hidden="true" />
                  Stripe needs a few more details
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-ink-soft">
                  {account.requirements_due.slice(0, 6).map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isOwner ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {!account.charges_enabled || account.requirements_due.length ? (
                  <PayoutActions businessId={business.id} mode="continue" />
                ) : null}
                <PayoutActions businessId={business.id} mode="dashboard" />
              </div>
            ) : null}
          </Card>

          {summary ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat label="Available" value={formatCents(summary.available)} hint="Ready to pay out" />
              <Stat label="On the way" value={formatCents(summary.pending)} hint="Processing" />
            </div>
          ) : null}

          {summary?.payouts.length ? (
            <Card>
              <CardTitle>Recent payouts</CardTitle>
              <ul className="divide-y divide-line text-sm">
                {summary.payouts.map((payout) => (
                  <li key={payout.id} className="flex justify-between gap-3 py-2.5">
                    <span>{formatDateTime(new Date(payout.arrival_date * 1000), business.timezone)}</span>
                    <span className="capitalize text-ink-soft">{payout.status.replace("_", " ")}</span>
                    <span className="font-semibold">{formatCents(payout.amount, payout.currency)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}

      <Card className="mt-6">
        <CardTitle>Recent payments</CardTitle>
        {payments?.length ? (
          <ul className="divide-y divide-line text-sm">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="font-semibold">{payment.customers?.full_name ?? "Customer"}</span>
                  <span className="text-ink-soft"> · {payment.kind === "deposit" ? "Deposit" : payment.kind === "tip" ? "Tip" : "Payment"}</span>
                  {payment.card_last4 ? <span className="text-ink-faint"> · {payment.card_brand} ····{payment.card_last4}</span> : null}
                </span>
                <span className="text-ink-faint">{formatDateTime(payment.succeeded_at ?? payment.created_at, business.timezone)}</span>
                <span className="font-semibold">
                  {formatCents(payment.amount_cents, payment.currency)}
                  <span className="ml-2 rounded-full bg-paper-deep px-2 py-0.5 text-xs font-medium capitalize text-ink-soft">
                    {payment.status.replace(/_/g, " ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">No payments yet. Deposits from your booking page will show up here.</p>
        )}
      </Card>
    </>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={ok ? "rounded-xl border border-brand-200 bg-brand-50 px-4 py-3" : "rounded-xl border border-line bg-paper px-4 py-3"}>
      <p className="text-sm font-semibold">{label}</p>
      <p className={ok ? "text-sm text-brand-700" : "text-sm text-ink-faint"}>{ok ? "Active" : "Not yet"}</p>
    </div>
  );
}
