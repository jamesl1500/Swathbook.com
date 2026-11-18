import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarPlus, CircleCheck, Clock, ExternalLink, Quote, Star, UserRound } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { siteConfig } from "@/libs/globals/site";
import { loadJobReport, type JobReport, type ReportPhoto } from "@/libs/job-report";
import { formatSqft } from "@/libs/measure/geo";
import { paymentReturnState, readPaymentReturn } from "@/libs/payment-return";
import { businessPagePath, customerBookingPath, routes } from "@/libs/routes";
import { noIndex } from "@/libs/seo";
import { hasStripe } from "@/libs/stripe/server";
import { publicAssetUrl } from "@/libs/supabase/storage";
import { formatDateLong, formatTime, toDateKey } from "@/libs/time";
import { brandOnLight, brandTextColor, formatCents } from "@/libs/utils";
import { PayButton } from "../pay-button";
import { PaymentWatcher } from "../payment-watcher";
import { BeforeAfter } from "./before-after";
import { TipForm } from "./tip-form";

export const metadata: Metadata = { title: "Your job report", robots: noIndex };

export default function JobReportPage({ params, searchParams }: PageProps<"/booking/[token]/report">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 h-96 max-w-2xl animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Report params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Report({
  params,
  searchParams,
}: {
  params: PageProps<"/booking/[token]/report">["params"];
  searchParams: PageProps<"/booking/[token]/report">["searchParams"];
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const report = await loadJobReport(token);
  if (!report) notFound();
  const payment = paymentReturnState(readPaymentReturn(query), report.booking);
  return <ReportView report={report} payment={payment} paymentsEnabled={hasStripe()} />;
}

function ReportView({
  report,
  payment,
  paymentsEnabled,
}: {
  report: JobReport;
  payment: ReturnType<typeof paymentReturnState>;
  paymentsEnabled: boolean;
}) {
  const { booking, business, photos, crewName, tipping } = report;
  const brand = business.brand_color ?? "#1c3d70";
  const tz = business.timezone;
  const logo = publicAssetUrl(business.logo_path);
  const money = (cents: number) => formatCents(cents, booking.currency);
  const done = booking.status === "completed";
  const before = photos.filter((photo) => photo.phase === "before");
  const after = photos.filter((photo) => photo.phase === "after");
  const balance = Math.max(0, booking.balance_due_cents ?? 0);
  const confirming = payment.state === "confirming";
  const tipped = booking.tip_cents > 0;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="text-(color:--on-brand)" style={{ backgroundColor: brand, "--on-brand": brandTextColor(brand) } as React.CSSProperties}>
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-8 sm:px-6">
          {logo ? (
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/95" style={{ color: brandOnLight(brand) }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- business logo from Supabase Storage */}
              <img src={logo} alt="" className="size-full object-cover" />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm text-(color:--on-brand)/80">Job report · {formatDateLong(toDateKey(new Date(booking.scheduled_start), tz))}</p>
            <h1 className="mt-1 text-3xl font-extrabold">{business.name}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
        {!done ? (
          <section className="rounded-[1.25rem] border border-line bg-card p-6 text-center">
            <h2 className="text-xl font-bold">Your report isn&apos;t ready yet</h2>
            <p className="mt-2 text-ink-soft">It fills in with photos and a note from the crew once the job is done.</p>
            <Link href={customerBookingPath(booking.public_token)} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline">
              View your booking
            </Link>
          </section>
        ) : (
          <>
            <section role="status" className="flex gap-3 rounded-[1.25rem] border border-brand-200 bg-brand-50 p-5 text-brand-700">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-bold">
                  {payment.state === "succeeded" && payment.kind === "tip" ? "Thank you for the tip!" : confirming ? "Payment received" : "All done"}
                </h2>
                <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {booking.started_at && booking.completed_at ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-4" aria-hidden="true" />
                      On site {formatTime(booking.started_at, tz)} – {formatTime(booking.completed_at, tz)}
                    </span>
                  ) : booking.completed_at ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-4" aria-hidden="true" />
                      Finished {formatTime(booking.completed_at, tz)}
                    </span>
                  ) : null}
                  {crewName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="size-4" aria-hidden="true" />
                      {crewName}
                    </span>
                  ) : null}
                </p>
                <PaymentWatcher active={confirming} />
              </div>
            </section>

            {photos.length ? <Photos before={before} after={after} /> : null}

            {booking.report_note ? (
              <section className="rounded-[1.25rem] border border-line bg-card p-5 sm:p-6">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Quote className="size-4" aria-hidden="true" />
                  {crewName ? `A note from ${crewName}` : "A note from the crew"}
                </h2>
                <p className="mt-2 whitespace-pre-line">{booking.report_note}</p>
              </section>
            ) : null}

            {tipping && !confirming ? (
              <section className="rounded-[1.25rem] border border-line bg-card p-5 sm:p-6" data-testid="tip">
                <h2 className="text-lg font-bold">{tipped ? `You tipped ${money(booking.tip_cents)}. Thank you!` : "Leave a tip?"}</h2>
                {tipped ? null : (
                  <div className="mt-3">
                    <TipForm
                      token={booking.public_token}
                      currency={booking.currency}
                      brandColor={brand}
                      suggestions={tipping.suggestions}
                      minCents={tipping.minCents}
                      maxCents={tipping.maxCents}
                      crewName={crewName}
                    />
                  </div>
                )}
              </section>
            ) : null}

            {business.google_review_url ? (
              <section className="rounded-[1.25rem] border border-line bg-card p-5 text-center sm:p-6" data-testid="review">
                <span className="mx-auto flex justify-center gap-1 text-sun" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star key={star} className="size-5 fill-current" />
                  ))}
                </span>
                <h2 className="mt-2 text-lg font-bold">How did we do?</h2>
                <p className="mt-1 text-sm text-ink-soft">A quick Google review helps {business.name} more than you&apos;d think.</p>
                <a
                  href={business.google_review_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-4 inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold"
                  style={{ backgroundColor: brand, color: brandTextColor(brand) }}
                >
                  Leave a Google review
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </section>
            ) : null}
          </>
        )}

        <section className="rounded-[1.25rem] border border-line bg-card p-5 sm:p-6">
          <h2 className="text-lg font-bold">What we did</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {[...booking.booking_items]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((item) => (
                <div key={`${item.name}-${item.sort_order}`} className="flex justify-between gap-3">
                  <dt>
                    {item.name}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </dt>
                  <dd>{money(item.line_total_cents ?? 0)}</dd>
                </div>
              ))}
            {booking.measured_area_sqft ? (
              <div className="flex justify-between gap-3 text-ink-soft">
                <dt>Area</dt>
                <dd>{formatSqft(booking.measured_area_sqft)}</dd>
              </div>
            ) : null}
            {booking.discount_cents > 0 ? (
              <div className="flex justify-between gap-3 text-brand-700">
                <dt>{booking.discount_reason ?? "Discount"}</dt>
                <dd>−{money(booking.discount_cents)}</dd>
              </div>
            ) : null}
            {booking.tip_cents > 0 ? (
              <div className="flex justify-between gap-3">
                <dt>Tip</dt>
                <dd>{money(booking.tip_cents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
              <dt>Total</dt>
              <dd>{money(booking.total_cents ?? 0)}</dd>
            </div>
            {balance > 0 ? (
              <div className="flex justify-between gap-3">
                <dt>Balance due</dt>
                <dd>{money(balance)}</dd>
              </div>
            ) : null}
          </dl>
          {done && balance >= 50 && paymentsEnabled && report.acceptsPayments && !confirming ? (
            <div className="mt-4">
              <PayButton
                token={booking.public_token}
                kind="balance"
                amountCents={balance}
                currency={booking.currency}
                brandColor={brand}
                returnPath={`/booking/${booking.public_token}/report`}
              />
            </div>
          ) : null}
        </section>

        <section className="flex flex-wrap gap-3">
          <Link
            href={businessPagePath(business.slug)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold hover:border-ink-faint"
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Book again
          </Link>
          <Link
            href={customerBookingPath(booking.public_token)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold hover:border-ink-faint"
          >
            Booking {booking.reference}
          </Link>
        </section>
      </main>

      <footer className="py-8 text-center text-xs text-ink-faint">
        <Link href={routes.home} className="inline-flex items-center gap-1.5 hover:text-ink">
          <LogoMark className="size-4" />
          Job reports by {siteConfig.name}
        </Link>
      </footer>
    </div>
  );
}

function Photos({ before, after }: { before: ReportPhoto[]; after: ReportPhoto[] }) {
  // The first before and after side by side; the rest below in a grid.
  const paired = before.length && after.length;
  const rest = paired ? [...before.slice(1), ...after.slice(1)] : [...before, ...after];
  return (
    <section className="rounded-[1.25rem] border border-line bg-card p-5 sm:p-6" aria-labelledby="photos-heading">
      <h2 id="photos-heading" className="text-lg font-bold">
        {paired ? "Before and after" : after.length ? "The finished job" : "Before we started"}
      </h2>
      {paired ? (
        <div className="mt-4">
          <BeforeAfter before={before[0].url} after={after[0].url} />
        </div>
      ) : null}
      {rest.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rest.map((photo) => (
            <li key={photo.id} className="relative overflow-hidden rounded-xl border border-line bg-paper-deep">
              <a href={photo.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private job photo */}
                <img src={photo.url} alt={photo.phase === "before" ? "Before" : "After"} loading="lazy" className="aspect-square w-full object-cover" />
              </a>
              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-[#0b1220]/75 px-2 py-0.5 text-xs font-bold capitalize text-white">
                {photo.phase}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
