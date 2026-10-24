import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarDays, Check, ExternalLink, Plus } from "lucide-react";
import { BookingStatusBadge, Card, CardTitle, PageHeader, Stat } from "@/components/app/ui";
import { CopyButton } from "@/components/app/copy-button";
import { buttonStyles } from "@/components/ui/button";
import { getDraftBusiness, listMyBusinesses } from "@/libs/auth";
import { requireBusinessContext } from "@/libs/dashboard";
import { siteConfig } from "@/libs/globals/site";
import { bookingPath, businessPagePath, routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createClient } from "@/libs/supabase/server";
import { addDays, dayRangeUtc, formatTime, todayKey } from "@/libs/time";
import { cn, formatCents } from "@/libs/utils";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Overview />
    </Suspense>
  );
}

type Overview = {
  jobs_today: number;
  jobs_next_7_days: number;
  requests_waiting: number;
  customers: number;
  collected_this_month_cents: number;
};

async function Overview() {
  const { business, user, canManage } = await requireBusinessContext(routes.dashboard);
  const supabase = await createClient();
  const today = todayKey(business.timezone);
  const { start, end } = dayRangeUtc(today, addDays(today, 1), business.timezone);

  const [{ data: overview }, { data: jobs }, { count: serviceCount }, { count: hoursCount }, { data: payout }, businesses, draft, siteUrl] =
    await Promise.all([
      supabase.rpc("business_overview", { p_business_id: business.id }),
      supabase
        .from("bookings")
        .select("id, status, scheduled_start, scheduled_end, customers(full_name), customer_addresses(line1, city), booking_items(name)")
        .eq("business_id", business.id)
        .gte("scheduled_start", start.toISOString())
        .lt("scheduled_start", end.toISOString())
        .not("status", "in", "(cancelled,no_show)")
        .order("scheduled_start"),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("is_active", true),
      supabase.from("business_hours").select("weekday", { count: "exact", head: true }).eq("business_id", business.id),
      supabase.from("stripe_connect_accounts").select("charges_enabled").eq("business_id", business.id).maybeSingle(),
      listMyBusinesses(user.id),
      getDraftBusiness(user.id),
      getSiteUrl(),
    ]);

  const stats = (overview ?? {}) as Partial<Overview>;
  const link = `${siteConfig.bookingHost}/${business.slug}`;
  const liveCount = businesses.filter((item) => item.onboarding_completed_at).length;

  const checklist = [
    { done: (serviceCount ?? 0) > 0, label: "Add your services", href: routes.services },
    { done: (hoursCount ?? 0) > 0, label: "Set your working hours", href: routes.availability },
    { done: Boolean(payout?.charges_enabled), label: "Connect payouts to take deposits", href: routes.payouts },
    { done: Boolean(business.description || business.logo_path), label: "Personalize and share your booking link", href: routes.bookingLink },
  ];

  return (
    <>
      <PageHeader
        eyebrow={business.is_published ? "You're live" : "Not published"}
        title={business.name}
        description={`Here's today in ${business.timezone.replace(/_/g, " ")}.`}
        actions={
          canManage ? (
            <Link href={routes.newBooking} className={buttonStyles({ size: "sm" })}>
              <Plus className="size-4" aria-hidden="true" />
              New job
            </Link>
          ) : null
        }
      />

      <section className="map-grid relative mb-8 overflow-hidden rounded-[1.75rem] p-6 text-paper sm:p-8">
        <p className="label-tag relative text-sky">Your booking link</p>
        <h2 className="relative mt-2 text-2xl font-extrabold sm:text-3xl">{business.name} is ready for bookings</h2>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className="max-w-full break-all rounded-2xl bg-paper px-4 py-2 font-mono text-sm font-semibold text-ink" data-testid="booking-link">
            {link}
          </span>
          <CopyButton value={`${siteUrl}${businessPagePath(business.slug)}`} className="bg-paper" />
          <Link
            href={businessPagePath(business.slug)}
            target="_blank"
            className={buttonStyles({ variant: "ghost", size: "sm", className: "text-paper hover:bg-paper/10 hover:text-paper" })}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Jobs today" value={stats.jobs_today ?? 0} />
        <Stat label="Next 7 days" value={stats.jobs_next_7_days ?? 0} hint={stats.requests_waiting ? `${stats.requests_waiting} waiting for you to accept` : undefined} />
        <Stat label="Customers" value={stats.customers ?? 0} />
        {canManage ? <Stat label="Collected this month" value={formatCents(stats.collected_this_month_cents ?? 0, business.currency)} /> : null}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle
            action={
              <Link href={routes.schedule} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
                Full schedule
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            }
          >
            Today
          </CardTitle>
          {jobs?.length ? (
            <ul className="divide-y divide-line">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link href={bookingPath(job.id)} className="flex items-center gap-4 py-3 hover:bg-paper/60">
                    <span className="w-20 shrink-0 font-display font-bold">{formatTime(job.scheduled_start, business.timezone)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{job.customers?.full_name}</span>
                      <span className="block truncate text-sm text-ink-soft">
                        {job.booking_items.map((item) => item.name).join(", ")}
                        {job.customer_addresses ? ` · ${job.customer_addresses.line1}` : ""}
                      </span>
                    </span>
                    <BookingStatusBadge status={job.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-paper px-4 py-6 text-ink-soft">
              <CalendarDays className="size-5 text-brand-500" aria-hidden="true" />
              Nothing on the books today.
            </p>
          )}
        </Card>

        {canManage ? (
          <Card>
            <CardTitle>Get set up</CardTitle>
            <ol className="space-y-2">
              {checklist.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-paper">
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border",
                        item.done ? "border-brand-600 bg-brand-600 text-paper" : "border-line-strong",
                      )}
                    >
                      {item.done ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </span>
                    <span className={cn("text-sm font-semibold", item.done && "text-ink-faint line-through")}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}
      </div>

      {draft ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sun/60 bg-sun-soft px-5 py-4 text-sm">
          <p>
            <strong>{draft.name}</strong> isn&apos;t finished setting up yet.
          </p>
          <Link href={routes.onboarding} className="font-semibold text-brand-700 underline underline-offset-4">
            Finish setup
          </Link>
        </div>
      ) : canManage ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
          <p className="text-ink-soft">
            {liveCount > 1
              ? `You run ${liveCount} businesses. Switch between them from the menu at the top.`
              : "Running more than one business? Each gets its own link, services and schedule."}
          </p>
          <Link href={routes.addBusiness} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
            <Plus className="size-4" aria-hidden="true" />
            Add a business
          </Link>
        </div>
      ) : null}
    </>
  );
}
