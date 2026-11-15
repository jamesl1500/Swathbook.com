import Link from "next/link";
import { CalendarPlus, CircleCheck, Clock, MapPin, Phone, TriangleAlert } from "lucide-react";
import { BookingAnswers, sortAnswers } from "@/components/booking/booking-answers";
import type { BookingOptions, CustomerBooking } from "@/libs/customer-booking";
import { paymentReturnState, type PaymentReturn, type PaymentReturnState } from "@/libs/payment-return";
import { businessPagePath } from "@/libs/routes";
import { formatDateLong, formatTime, toDateKey, todayKey } from "@/libs/time";
import { brandTextColor, formatCents } from "@/libs/utils";
import { ManageBooking } from "./manage-booking";
import { PayButton } from "./pay-button";
import { PaymentWatcher } from "./payment-watcher";

/**
 * Everything a customer sees and does with one booking: status, payment,
 * when and where, what's booked, and reschedule or cancel. Shared by the
 * emailed manage-booking page (/booking/<token>) and the signed-in customer's
 * job page (/my/jobs/<id>), so both always follow the same rules.
 */

export function statusBanner(booking: CustomerBooking, payment: PaymentReturnState = { state: "none" }) {
  const holdActive = booking.hold_expires_at ? new Date(booking.hold_expires_at) > new Date() : false;
  // Just back from paying: say where that payment stands first.
  if (payment.state === "confirming") {
    return { tone: "info", title: "Payment received", body: "We're confirming it with the bank. This page updates on its own." } as const;
  }
  if (payment.state === "failed") {
    return { tone: "error", title: "Your payment didn't go through", body: "You haven't been charged. Try again below, or use a different card." } as const;
  }
  if (payment.state === "succeeded" && payment.kind === "balance") {
    return { tone: "success", title: "Payment received", body: "Thanks! Your receipt is on its way by email." } as const;
  }
  switch (booking.status) {
    case "pending_payment":
      return holdActive
        ? ({
            tone: "info",
            title: "Pay your deposit to confirm",
            body: `We're holding this time for you until ${formatTime(booking.hold_expires_at!, booking.businesses!.timezone)}. After that it opens up for other customers.`,
          } as const)
        : ({ tone: "error", title: "This time was released", body: "The deposit wasn't paid in time. Pick a new time to book again." } as const);
    case "requested":
      return { tone: "info", title: "Request sent", body: "The business will confirm your appointment soon. We'll email you." } as const;
    case "confirmed":
      if (booking.cancel_requested_at) {
        return { tone: "info", title: "Cancellation requested", body: "The business will confirm by email. Until then, your booking stays on the calendar." } as const;
      }
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

export function BookingPanel({
  booking,
  options,
  paymentReturn,
  paymentsEnabled,
  paymentReturnPath,
}: {
  booking: CustomerBooking;
  options: BookingOptions | null;
  /** Set when the customer has just come back from paying (see readPaymentReturn). */
  paymentReturn: PaymentReturn | null;
  paymentsEnabled: boolean;
  /** Where Stripe sends the customer back after paying (`?paid=1` is added). */
  paymentReturnPath?: string;
}) {
  const business = booking.businesses!;
  const brand = business.brand_color ?? "#1c3d70";
  const timeZone = business.timezone;
  const payment = paymentReturnState(paymentReturn, booking);
  const confirming = payment.state === "confirming";
  const banner = statusBanner(booking, payment);
  const holdActive = booking.hold_expires_at ? new Date(booking.hold_expires_at) > new Date() : false;
  const depositOwed = Math.max(0, booking.deposit_due_cents - booking.deposit_paid_cents);
  const balanceOwed = Math.max(0, booking.balance_due_cents ?? 0);
  const canPayDeposit = paymentsEnabled && !confirming && booking.status === "pending_payment" && holdActive && depositOwed > 0;
  const canPayBalance =
    paymentsEnabled && !confirming && ["confirmed", "in_progress", "completed"].includes(booking.status) && balanceOwed >= 50;
  const address = booking.customer_addresses;
  const succeeded = booking.payments.filter((payment) => ["succeeded", "partially_refunded", "refunded"].includes(payment.status));

  return (
    <>
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
          <PaymentWatcher active={confirming} />
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
            returnPath={paymentReturnPath}
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
        {booking.booking_answers.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-bold">Your answers</h3>
            <BookingAnswers answers={sortAnswers(booking.booking_answers)} />
          </div>
        ) : null}
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

      {options ? (
        <ManageBooking
          token={booking.public_token}
          options={options}
          timeZone={timeZone}
          today={todayKey(timeZone)}
          brandColor={brand}
          businessName={business.name}
          contact={business.phone ?? business.email}
          depositPaid={booking.deposit_paid_cents > 0}
        />
      ) : null}

      {!options?.can_reschedule && !options?.can_cancel && business.cancellation_window_hours > 0 && ["confirmed", "requested"].includes(booking.status) ? (
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
    </>
  );
}
