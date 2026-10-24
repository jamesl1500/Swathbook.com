import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarPlus, CircleCheck, Clock, MapPin, Phone, TriangleAlert } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { loadCustomerBooking, type CustomerBooking } from "@/libs/customer-booking";
import { siteConfig } from "@/libs/globals/site";
import { businessPagePath, routes } from "@/libs/routes";
import { noIndex } from "@/libs/seo";
import { hasStripe } from "@/libs/stripe/server";
import { formatDateLong, formatTime, toDateKey } from "@/libs/time";
import { brandTextColor, formatCents } from "@/libs/utils";
import { PayButton } from "./pay-button";

export const metadata: Metadata = { title: "Your booking", robots: noIndex };

export default function CustomerBookingPage({ params, searchParams }: PageProps<"/booking/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 h-96 max-w-2xl animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <BookingDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BookingDetails({
  params,
  searchParams,
}: {
  params: PageProps<"/booking/[token]">["params"];
  searchParams: PageProps<"/booking/[token]">["searchParams"];
}) {
  const [{ token }, { paid }] = await Promise.all([params, searchParams]);
  const booking = await loadCustomerBooking(token);
  if (!booking || !booking.businesses) notFound();
  return <BookingView booking={booking} justPaid={paid === "1"} paymentsEnabled={hasStripe()} />;
}

function statusBanner(booking: CustomerBooking, justPaid: boolean) {
  const holdActive = booking.hold_expires_at ? new Date(booking.hold_expires_at) > new Date() : false;
  switch (booking.status) {
    case "pending_payment":
      if (justPaid) return { tone: "info", title: "Payment received", body: "We're confirming it with the bank. This page updates in a moment." } as const;
      return holdActive
        ? ({ tone: "info", title: "Pay your deposit to confirm", body: "We're holding this time for you for a few more minutes." } as const)
        : ({ tone: "error", title: "This time was released", body: "The deposit wasn't paid in time. Pick a new time to book again." } as const);
    case "requested":
      return { tone: "info", title: "Request sent", body: "The business will confirm your appointment soon. We'll email you." } as const;
    case "confirmed":
      return { tone: "success", title: "You're booked!", body: "We've emailed your confirmation. See you then." } as const;
    case "in_progress":
      return { tone: "success", title: "Work in progress", body: "Your crew is on the job." } as const;
    case "completed":
      return { tone: "success", title: "All done", body: "Thanks for booking. We hope everything looks great." } as const;
    case "cancelled":
      return { tone: "error", title: "Cancelled", body: "This appointment was cancelled." } as const;
    default:
      return { tone: "error", title: "Missed appointment", body: "This appointment was marked as missed." } as const;
  }
}

function BookingView({ booking, justPaid, paymentsEnabled }: { booking: CustomerBooking; justPaid: boolean; paymentsEnabled: boolean }) {
  const business = booking.businesses!;
  const brand = business.brand_color ?? "#1c3d70";
  const timeZone = business.timezone;
  const banner = statusBanner(booking, justPaid);
  const holdActive = booking.hold_expires_at ? new Date(booking.hold_expires_at) > new Date() : false;
  const depositOwed = Math.max(0, booking.deposit_due_cents - booking.deposit_paid_cents);
  const balanceOwed = Math.max(0, booking.balance_due_cents ?? 0);
  const canPayDeposit = paymentsEnabled && !justPaid && booking.status === "pending_payment" && holdActive && depositOwed > 0;
  const canPayBalance =
    paymentsEnabled && !justPaid && ["confirmed", "in_progress", "completed"].includes(booking.status) && balanceOwed >= 50;
  const address = booking.customer_addresses;
  const succeeded = booking.payments.filter((payment) => ["succeeded", "partially_refunded", "refunded"].includes(payment.status));

  return (
    <div className="min-h-dvh bg-paper">
      <header
        className="text-(color:--on-brand)"
        style={{ backgroundColor: brand, "--on-brand": brandTextColor(brand) } as React.CSSProperties}
      >
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <p className="text-sm text-(color:--on-brand)/80">Booking {booking.reference}</p>
          <h1 className="mt-1 text-3xl font-extrabold">{business.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
        <section
          role="status"
          className={
            banner.tone === "success"
              ? "flex gap-3 rounded-[1.25rem] border border-brand-200 bg-brand-50 p-5 text-brand-700"
              : banner.tone === "error"
                ? "flex gap-3 rounded-[1.25rem] border border-clay/40 bg-clay-soft p-5 text-clay-ink"
                : "flex gap-3 rounded-[1.25rem] border border-sun/60 bg-sun-soft p-5"
          }
        >
          {banner.tone === "success" ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          ) : banner.tone === "error" ? (
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          ) : (
            <Clock className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          )}
          <div>
            <h2 className="font-bold">{banner.title}</h2>
            <p className="mt-0.5 text-sm">{banner.body}</p>
          </div>
        </section>

        {canPayDeposit || canPayBalance ? (
          <section className="rounded-[1.25rem] border border-line bg-card p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-bold">{canPayDeposit ? "Deposit" : "Balance due"}</h2>
            <PayButton
              token={booking.public_token}
              kind={canPayDeposit ? "deposit" : "balance"}
              amountCents={canPayDeposit ? depositOwed : balanceOwed}
              currency={booking.currency}
              brandColor={brand}
            />
          </section>
        ) : null}

        <section className="rounded-[1.25rem] border border-line bg-card p-5 sm:p-6">
          <h2 className="text-lg font-bold">{formatDateLong(toDateKey(new Date(booking.scheduled_start), timeZone))}</h2>
          <p className="text-ink-soft">
            {formatTime(booking.scheduled_start, timeZone)} – {formatTime(booking.scheduled_end, timeZone)}
          </p>
          {address ? (
            <p className="mt-3 flex gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span>
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                {address.city ? `, ${address.city}` : ""} {address.region ?? ""} {address.postal_code ?? ""}
              </span>
            </p>
          ) : null}

          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            {[...booking.booking_items].sort((a, b) => a.sort_order - b.sort_order).map((item) => (
              <div key={`${item.name}-${item.sort_order}`} className="flex justify-between gap-3">
                <dt>
                  {item.name}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                </dt>
                <dd>{formatCents(item.line_total_cents ?? 0, booking.currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
              <dt>Total</dt>
              <dd>{formatCents(booking.total_cents ?? 0, booking.currency)}</dd>
            </div>
            {succeeded.length ? (
              <div className="flex justify-between gap-3 text-brand-700">
                <dt>Paid</dt>
                <dd>{formatCents(booking.amount_paid_cents - booking.amount_refunded_cents, booking.currency)}</dd>
              </div>
            ) : null}
            {balanceOwed > 0 ? (
              <div className="flex justify-between gap-3">
                <dt>Balance</dt>
                <dd>{formatCents(balanceOwed, booking.currency)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="flex flex-wrap gap-3">
          {["confirmed", "requested", "pending_payment"].includes(booking.status) ? (
            <a
              href={`/booking/${booking.public_token}/calendar`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold hover:border-ink-faint"
            >
              <CalendarPlus className="size-4" aria-hidden="true" />
              Add to calendar
            </a>
          ) : null}
          {business.phone ? (
            <a
              href={`tel:${business.phone}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-semibold hover:border-ink-faint"
            >
              <Phone className="size-4" aria-hidden="true" />
              Call {business.name}
            </a>
          ) : null}
          {booking.status === "cancelled" || (booking.status === "pending_payment" && !holdActive) ? (
            <Link
              href={businessPagePath(business.slug)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: brand, color: brandTextColor(brand) }}
            >
              Book a new time
            </Link>
          ) : null}
        </section>

        {business.cancellation_window_hours > 0 && ["confirmed", "requested"].includes(booking.status) ? (
          <p className="text-sm text-ink-faint">
            Need to change or cancel? Contact {business.name} at least {business.cancellation_window_hours} hours ahead
            {business.email ? (
              <>
                {" "}
                at <a href={`mailto:${business.email}`} className="underline">{business.email}</a>
              </>
            ) : null}
            .
          </p>
        ) : null}
      </main>

      <footer className="py-8 text-center text-xs text-ink-faint">
        <Link href={routes.home} className="inline-flex items-center gap-1.5 hover:text-ink">
          <LogoMark className="size-4" />
          Booking powered by {siteConfig.name}
        </Link>
      </footer>
    </div>
  );
}
