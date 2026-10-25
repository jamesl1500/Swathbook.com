import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Clock, ExternalLink, Mail, MapPin, MessageSquareText, Navigation, Phone } from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";
import { BookingStatusBadge, Card, CardTitle, bookingStatusLabel } from "@/components/app/ui";
import { formatAddress } from "@/libs/address";
import { requireBusinessContext } from "@/libs/dashboard";
import { customerBookingPath, customerPath, routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createClient } from "@/libs/supabase/server";
import { loadTeam } from "@/libs/team";
import { formatDateLong, formatDateTime, formatTime, toDateKey, toTimeKey } from "@/libs/time";
import { formatCents, formatDuration } from "@/libs/utils";
import { refundByDefault } from "@/libs/booking-policy";
import { CancelRequestControls } from "../../bookings/booking-actions";
import { AssignForm, NotesForm, RefundButton, RescheduleForm, StatusActions } from "../job-actions";

export const metadata: Metadata = { title: "Job" };

export default function BookingPage({ params }: PageProps<"/dashboard/schedule/[bookingId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <BookingDetail params={params} />
    </Suspense>
  );
}

const EVENT_LABELS: Record<string, string> = {
  created: "Booked",
  status_changed: "Status changed",
  rescheduled: "Rescheduled",
  reassigned: "Reassigned",
  payment: "Payment received",
  note: "Note",
};

async function BookingDetail({ params }: { params: PageProps<"/dashboard/schedule/[bookingId]">["params"] }) {
  const { bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) notFound();
  const { business, canManage, memberId } = await requireBusinessContext(routes.schedule);

  const supabase = await createClient();
  const [{ data: booking }, team, siteUrl] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `*, customers(id, full_name, email, phone), customer_addresses(line1, line2, city, region, postal_code, lat, lng, access_notes),
         booking_items(id, name, quantity, unit_price_cents, line_total_cents, duration_minutes, sort_order),
         payments(id, kind, status, amount_cents, amount_refunded_cents, succeeded_at, created_at, card_brand, card_last4),
         booking_events(id, event_type, from_status, to_status, created_at, data)`,
      )
      .eq("id", bookingId)
      .eq("business_id", business.id)
      .maybeSingle(),
    loadTeam(business.id),
    getSiteUrl(),
  ]);
  if (!booking) notFound();

  const tz = business.timezone;
  const start = new Date(booking.scheduled_start);
  const durationMinutes = Math.round((new Date(booking.scheduled_end).getTime() - start.getTime()) / 60_000);
  const address = booking.customer_addresses;
  const assignee = team.find((person) => person.id === booking.assigned_member_id);
  const payLink = `${siteUrl}${customerBookingPath(booking.public_token)}`;
  const items = [...booking.booking_items].sort((a, b) => a.sort_order - b.sort_order);
  const events = [...booking.booking_events].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      <Link href={routes.schedule} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Schedule
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-tag text-ink-faint">Job {booking.reference}</p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{booking.customers?.full_name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" />
              {formatDateLong(toDateKey(start, tz))}, {formatTime(start, tz)} – {formatTime(booking.scheduled_end, tz)}
            </span>
            <BookingStatusBadge status={booking.status} />
          </p>
        </div>
        <StatusActions
          businessId={business.id}
          bookingId={booking.id}
          status={booking.status}
          canManage={canManage}
          isAssignedToMe={booking.assigned_member_id === memberId}
        />
      </div>

      {booking.status === "pending_payment" && booking.hold_expires_at ? (
        <p className="mb-6 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm" data-testid="hold-notice">
          <strong>Waiting for the deposit.</strong> The time is held until {formatTime(booking.hold_expires_at, tz)}. If it isn&apos;t paid by then,
          the time is released and the customer gets an email to pick a new one.
        </p>
      ) : null}
      {booking.cancel_requested_at && canManage ? (
        <section className="mb-6 rounded-2xl border border-clay/40 bg-clay-soft/60 p-4" data-testid="cancel-request" aria-labelledby="cancel-request-heading">
          <h2 id="cancel-request-heading" className="font-bold">
            {booking.customers?.full_name ?? "The customer"} asked to cancel
          </h2>
          <p className="mt-1 text-sm">
            Requested {formatDateTime(booking.cancel_requested_at, tz)}.
            {booking.cancel_request_reason ? <> &ldquo;{booking.cancel_request_reason}&rdquo;</> : null}
          </p>
          <div className="mt-3">
            <CancelRequestControls
              businessId={business.id}
              bookingId={booking.id}
              name={booking.customers?.full_name ?? "the customer"}
              paidCents={booking.deposit_paid_cents}
              currency={booking.currency}
              refundByDefault={refundByDefault(business.deposit_refund_policy, booking.cancel_requested_at, booking.scheduled_start, business.cancellation_window_hours)}
            />
          </div>
        </section>
      ) : null}
      {booking.status === "cancelled" && booking.cancellation_reason ? (
        <p className="mb-6 rounded-2xl border border-line bg-paper-deep/60 px-4 py-3 text-sm" data-testid="cancel-reason">
          <strong>Cancelled:</strong> {booking.cancellation_reason === "Payment hold expired" ? "the deposit wasn't paid within 30 minutes, so the time was released." : booking.cancellation_reason}
        </p>
      ) : null}
      <QuickActions phone={booking.customers?.phone ?? null} directionsUrl={address ? directionsUrl(address) : null} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Where</CardTitle>
            {address ? (
              <>
                <p className="flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  <span>{formatAddress(address)}</span>
                </p>
                {address.access_notes ? (
                  <p className="mt-3 rounded-xl bg-sun-soft px-4 py-3 text-sm">
                    <strong>Access notes:</strong> {address.access_notes}
                  </p>
                ) : null}
                <a
                  href={directionsUrl(address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Directions
                </a>
              </>
            ) : (
              <p className="text-sm text-ink-soft">No service address on this job.</p>
            )}
          </Card>

          <Card>
            <CardTitle>Services</CardTitle>
            <ul className="divide-y divide-line text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {item.name}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    {item.duration_minutes ? <span className="text-ink-faint"> · {formatDuration(item.duration_minutes)}</span> : null}
                  </span>
                  {canManage ? <span className="font-semibold">{formatCents(item.line_total_cents ?? 0, booking.currency)}</span> : null}
                </li>
              ))}
            </ul>
            {canManage ? (
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Total</dt>
                  <dd className="font-semibold">{formatCents(booking.total_cents ?? 0, booking.currency)}</dd>
                </div>
                {booking.deposit_due_cents > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Deposit</dt>
                    <dd>
                      {formatCents(booking.deposit_paid_cents, booking.currency)} of {formatCents(booking.deposit_due_cents, booking.currency)} paid
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Balance due</dt>
                  <dd className="font-semibold">{formatCents(Math.max(0, booking.balance_due_cents ?? 0), booking.currency)}</dd>
                </div>
              </dl>
            ) : null}
            {booking.customer_notes ? (
              <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm">
                <strong>Customer note:</strong> {booking.customer_notes}
              </p>
            ) : null}
          </Card>

          {canManage ? (
            <Card>
              <CardTitle>Payments</CardTitle>
              {booking.payments.length ? (
                <ul className="divide-y divide-line text-sm">
                  {booking.payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span>
                        <span className="font-semibold capitalize">{payment.kind}</span>
                        <span className="text-ink-soft"> · {formatDateTime(payment.succeeded_at ?? payment.created_at, tz)}</span>
                        {payment.card_last4 ? <span className="text-ink-faint"> · ····{payment.card_last4}</span> : null}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{formatCents(payment.amount_cents, booking.currency)}</span>
                        <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs capitalize">{payment.status.replace(/_/g, " ")}</span>
                        {["succeeded", "partially_refunded"].includes(payment.status) ? (
                          <RefundButton
                            businessId={business.id}
                            paymentId={payment.id}
                            label={formatCents(payment.amount_cents - payment.amount_refunded_cents, booking.currency)}
                          />
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">No payments yet.</p>
              )}
              <div className="mt-4 rounded-xl bg-paper p-4">
                <p className="text-sm font-semibold">Customer&apos;s booking page</p>
                <p className="mt-0.5 text-sm text-ink-soft">They can see the details and pay any balance here.</p>
                <div className="mt-3">
                  <CopyButton value={payLink} label="Copy payment link" />
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Customer</CardTitle>
            <p className="font-semibold">
              {canManage && booking.customers ? (
                <Link href={customerPath(booking.customers.id)} className="text-brand-600 hover:underline">
                  {booking.customers.full_name}
                </Link>
              ) : (
                booking.customers?.full_name
              )}
            </p>
            <div className="mt-2 space-y-1 text-sm">
              {booking.customers?.phone ? (
                <a href={`tel:${booking.customers.phone}`} className="flex items-center gap-2 text-ink-soft hover:text-ink">
                  <Phone className="size-4" aria-hidden="true" />
                  {booking.customers.phone}
                </a>
              ) : null}
              {booking.customers?.email ? (
                <a href={`mailto:${booking.customers.email}`} className="flex items-center gap-2 text-ink-soft hover:text-ink">
                  <Mail className="size-4" aria-hidden="true" />
                  {booking.customers.email}
                </a>
              ) : null}
            </div>
          </Card>

          {canManage ? (
            <Card>
              <CardTitle>Schedule</CardTitle>
              <div className="space-y-5">
                <AssignForm businessId={business.id} bookingId={booking.id} memberId={booking.assigned_member_id} team={team} />
                <RescheduleForm
                  businessId={business.id}
                  bookingId={booking.id}
                  date={toDateKey(start, tz)}
                  time={toTimeKey(start, tz)}
                  durationMinutes={durationMinutes}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <CardTitle>Crew</CardTitle>
              <p className="text-sm">{assignee?.name ?? "Unassigned"}</p>
            </Card>
          )}

          {canManage ? (
            <Card>
              <CardTitle>Team notes</CardTitle>
              <NotesForm businessId={business.id} bookingId={booking.id} notes={booking.internal_notes ?? ""} />
            </Card>
          ) : booking.internal_notes ? (
            <Card>
              <CardTitle>Team notes</CardTitle>
              <p className="whitespace-pre-line text-sm">{booking.internal_notes}</p>
            </Card>
          ) : null}

          <Card>
            <CardTitle>Timeline</CardTitle>
            <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
              {events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-brand-500" aria-hidden="true" />
                  <p className="font-semibold">
                    {event.event_type === "status_changed" && event.to_status
                      ? `${bookingStatusLabel(event.to_status)}`
                      : (EVENT_LABELS[event.event_type] ?? event.event_type)}
                  </p>
                  <p className="text-ink-faint">{formatDateTime(event.created_at, tz)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

type JobAddress = Parameters<typeof formatAddress>[0] & { lat: number | null; lng: number | null };

function directionsUrl(address: JobAddress) {
  const destination = address.lat != null ? `${address.lat},${address.lng}` : formatAddress(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Big, thumb-sized shortcuts for the things you do from the driveway. */
function QuickActions({ phone, directionsUrl: directions }: { phone: string | null; directionsUrl: string | null }) {
  if (!phone && !directions) return null;
  const action =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-card px-4 font-semibold text-ink shadow-card hover:border-ink-faint sm:flex-none";
  return (
    <div className="mb-6 flex gap-2">
      {phone ? (
        <>
          <a href={`tel:${phone}`} className={action}>
            <Phone className="size-5 text-brand-600" aria-hidden="true" />
            Call
          </a>
          <a href={`sms:${phone}`} className={action}>
            <MessageSquareText className="size-5 text-brand-600" aria-hidden="true" />
            Text
          </a>
        </>
      ) : null}
      {directions ? (
        <a href={directions} target="_blank" rel="noreferrer" className={action}>
          <Navigation className="size-5 text-brand-600" aria-hidden="true" />
          Directions
        </a>
      ) : null}
    </div>
  );
}
