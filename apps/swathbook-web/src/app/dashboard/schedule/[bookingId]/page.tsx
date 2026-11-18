import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  CreditCard,
  ExternalLink,
  History,
  LayoutList,
  Mail,
  MapPin,
  MessageSquareText,
  Navigation,
  NotebookPen,
  Phone,
  Ruler,
  Images,
  UserRound,
} from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";
import { Tabs, type TabItem } from "@/components/app/tabs";
import { BookingStatusBadge, Card, CardTitle } from "@/components/app/ui";
import { BookingAnswers, sortAnswers } from "@/components/booking/booking-answers";
import { formatAddress } from "@/libs/address";
import { refundByDefault } from "@/libs/booking-policy";
import { requireBusinessContext } from "@/libs/dashboard";
import { customerBookingPath, customerPath, routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createClient } from "@/libs/supabase/server";
import { loadTeam } from "@/libs/team";
import { formatDateLong, formatDateTime, formatTime, toDateKey, toTimeKey } from "@/libs/time";
import { formatSqft } from "@/libs/measure/geo";
import { JOB_FILES_BUCKET } from "@/libs/supabase/storage";
import { formatCents, formatDuration } from "@/libs/utils";
import { CancelRequestControls } from "../../bookings/booking-actions";
import { AssignForm, JobActionBar, NotesForm, RefundButton, RescheduleForm } from "../job-actions";
import { describeJobEvent } from "./job-events";
import { ReportPanel, type ReportPhoto } from "./report-panel";
import { PropertyNotes } from "@/components/property/property-notes";
import { canMeasure, satelliteLinks } from "@/libs/google/satellite";
import { readPropertyMap } from "@/libs/property";

export const metadata: Metadata = { title: "Job" };

export default function BookingPage({ params }: PageProps<"/dashboard/schedule/[bookingId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <BookingDetail params={params} />
    </Suspense>
  );
}

async function BookingDetail({ params }: { params: PageProps<"/dashboard/schedule/[bookingId]">["params"] }) {
  const { bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) notFound();
  const { business, canManage, memberId, user } = await requireBusinessContext(routes.schedule);

  const supabase = await createClient();
  const [{ data: booking }, team, siteUrl] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `*, customers(id, full_name, email, phone), customer_addresses(id, line1, line2, city, region, postal_code, lat, lng, access_notes, gate_code, pets, property_map),
         booking_items(id, name, quantity, unit_price_cents, line_total_cents, duration_minutes, sort_order),
         booking_answers(service_name, prompt, answer, sort_order),
         payments(id, kind, status, amount_cents, amount_refunded_cents, succeeded_at, created_at, card_brand, card_last4),
         booking_events(id, event_type, from_status, to_status, created_at, data),
         booking_attachments(id, storage_path, phase, uploaded_by, created_at)`,
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
  const customerName = booking.customers?.full_name ?? "Customer";
  const address = booking.customer_addresses;
  const assignee = team.find((person) => person.id === booking.assigned_member_id);
  const payLink = `${siteUrl}${customerBookingPath(booking.public_token)}`;
  const items = [...booking.booking_items].sort((a, b) => a.sort_order - b.sort_order);
  const answers = sortAnswers(booking.booking_answers);
  // Newest first: what just happened is what you came to check.
  const events = [...booking.booking_events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const balance = Math.max(0, booking.balance_due_cents ?? 0);
  const money = (cents: number) => formatCents(cents, booking.currency);
  const hasOutline = Array.isArray(booking.measurement) && booking.measurement.length > 0;
  const addressPoint = address?.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null;
  const propertyLinks = addressPoint && canMeasure() ? satelliteLinks(addressPoint) : null;

  // Report photos, oldest first, with short-lived links (the bucket is private).
  const reportFiles = [...booking.booking_attachments]
    .filter((file): file is typeof file & { phase: "before" | "after" } => file.phase === "before" || file.phase === "after")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { data: signed } = reportFiles.length
    ? await supabase.storage.from(JOB_FILES_BUCKET).createSignedUrls(reportFiles.map((file) => file.storage_path), 60 * 60)
    : { data: [] };
  const photos: ReportPhoto[] = reportFiles.map((file, index) => ({
    id: file.id,
    url: signed?.[index]?.signedUrl ?? null,
    phase: file.phase,
    canDelete: canManage || file.uploaded_by === user.id,
  }));

  const tabs: TabItem[] = [
    {
      id: "overview",
      label: "Overview",
      icon: <LayoutList />,
      content: (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardTitle>What&apos;s booked</CardTitle>
              <ul className="divide-y divide-line text-sm">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {item.name}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      {item.duration_minutes ? <span className="text-ink-faint"> · {formatDuration(item.duration_minutes)}</span> : null}
                    </span>
                    {canManage ? <span className="font-semibold">{money(item.line_total_cents ?? 0)}</span> : null}
                  </li>
                ))}
              </ul>
              {canManage && booking.discount_cents > 0 ? (
                <p className="mt-2 flex justify-between gap-3 border-t border-line pt-2 text-sm text-brand-700">
                  <span>{booking.discount_reason ?? "Discount"}</span>
                  <span className="font-semibold">−{money(booking.discount_cents)}</span>
                </p>
              ) : null}
              {booking.customer_notes ? (
                <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm">
                  <strong>Customer note:</strong> {booking.customer_notes}
                </p>
              ) : null}
            </Card>

            {booking.measured_area_sqft ? (
              <Card>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Ruler className="size-4" aria-hidden="true" />
                    Measured area
                  </span>
                </CardTitle>
                <p className="text-sm">
                  <strong>{formatSqft(booking.measured_area_sqft)}</strong>
                  <span className="text-ink-soft">{hasOutline ? " · outlined by the customer on the map" : " · entered by the customer"}</span>
                </p>
                {hasOutline ? (
                  // eslint-disable-next-line @next/next/no-img-element -- proxied Static Maps image
                  <img
                    src={`/api/maps/measurement/${booking.id}`}
                    alt="The area the customer outlined"
                    loading="lazy"
                    className="mt-3 aspect-[16/10] w-full rounded-xl border border-line bg-paper-deep object-cover"
                  />
                ) : null}
              </Card>
            ) : null}

            {answers.length ? (
              <Card>
                <CardTitle>Customer answers</CardTitle>
                <BookingAnswers answers={answers} />
              </Card>
            ) : null}

            {address ? (
              <Card>
                <CardTitle>Property</CardTitle>
                <PropertyNotes
                  businessId={business.id}
                  compact
                  canEdit
                  center={addressPoint}
                  links={propertyLinks}
                  value={{
                    addressId: address.id,
                    gateCode: address.gate_code ?? "",
                    pets: address.pets ?? "",
                    accessNotes: address.access_notes ?? "",
                    map: readPropertyMap(address.property_map),
                  }}
                />
              </Card>
            ) : null}

            <Card>
              <CardTitle>Where</CardTitle>
              {address ? (
                <>
                  <p className="flex gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>{formatAddress(address)}</span>
                  </p>
                  <a
                    href={directionsUrl(address)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Directions
                  </a>
                </>
              ) : (
                <p className="text-sm text-ink-soft">No service address on this job.</p>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardTitle>Customer</CardTitle>
              <p className="font-semibold">
                {canManage && booking.customers ? (
                  <Link href={customerPath(booking.customers.id)} className="inline-flex min-h-9 items-center text-brand-600 hover:underline">
                    {customerName}
                  </Link>
                ) : (
                  customerName
                )}
              </p>
              <div className="mt-2 space-y-1 text-sm">
                {booking.customers?.phone ? (
                  <a href={`tel:${booking.customers.phone}`} className="flex min-h-9 items-center gap-2 text-ink-soft hover:text-ink">
                    <Phone className="size-4" aria-hidden="true" />
                    {booking.customers.phone}
                  </a>
                ) : null}
                {booking.customers?.email ? (
                  <a href={`mailto:${booking.customers.email}`} className="flex min-h-9 min-w-0 items-center gap-2 text-ink-soft hover:text-ink">
                    <Mail className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{booking.customers.email}</span>
                  </a>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardTitle>Crew</CardTitle>
              <p className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-ink-faint" aria-hidden="true" />
                {assignee?.name ?? "Unassigned"}
              </p>
              {canManage ? <p className="mt-2 text-sm text-ink-soft">Change who&apos;s on it, or move the time, under Schedule.</p> : null}
            </Card>
          </div>
        </div>
      ),
    },
  ];

  if (canManage) {
    tabs.push(
      {
        id: "payments",
        label: "Payments",
        icon: <CreditCard />,
        badge: balance > 0 ? `${money(balance)} due` : undefined,
        content: (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
                        <span className="font-semibold">{money(payment.amount_cents)}</span>
                        <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs capitalize">{payment.status.replace(/_/g, " ")}</span>
                        {["succeeded", "partially_refunded"].includes(payment.status) ? (
                          <RefundButton businessId={business.id} paymentId={payment.id} label={money(payment.amount_cents - payment.amount_refunded_cents)} />
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">No payments yet.</p>
              )}
            </Card>
            <div className="space-y-6">
              <Card>
                <CardTitle>Summary</CardTitle>
                <dl className="space-y-2 text-sm">
                  {booking.discount_cents > 0 ? (
                    <div className="flex justify-between text-brand-700">
                      <dt>{booking.discount_reason ?? "Discount"}</dt>
                      <dd>−{money(booking.discount_cents)}</dd>
                    </div>
                  ) : null}
                  {booking.tip_cents > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-ink-soft">Tip</dt>
                      <dd>{money(booking.tip_cents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Total</dt>
                    <dd className="font-semibold">{money(booking.total_cents ?? 0)}</dd>
                  </div>
                  {booking.deposit_due_cents > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-ink-soft">Deposit</dt>
                      <dd>
                        {money(booking.deposit_paid_cents)} of {money(booking.deposit_due_cents)} paid
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-line pt-2">
                    <dt className="text-ink-soft">Balance due</dt>
                    <dd className="font-semibold">{money(balance)}</dd>
                  </div>
                </dl>
              </Card>
              <Card>
                <CardTitle>Customer&apos;s booking page</CardTitle>
                <p className="-mt-2 text-sm text-ink-soft">They can see the details and pay any balance here.</p>
                <div className="mt-3">
                  <CopyButton value={payLink} label="Copy payment link" />
                </div>
              </Card>
            </div>
          </div>
        ),
      },
      {
        id: "schedule",
        label: "Schedule",
        icon: <CalendarClock />,
        content: (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>Who&apos;s on it</CardTitle>
              <AssignForm businessId={business.id} bookingId={booking.id} memberId={booking.assigned_member_id} team={team} />
            </Card>
            <Card>
              <CardTitle>Move it</CardTitle>
              <RescheduleForm businessId={business.id} bookingId={booking.id} date={toDateKey(start, tz)} time={toTimeKey(start, tz)} durationMinutes={durationMinutes} />
            </Card>
          </div>
        ),
      },
    );
  }

  if (booking.status !== "cancelled") {
    tabs.push({
      id: "report",
      label: "Report",
      icon: <Images />,
      badge: photos.length ? String(photos.length) : undefined,
      content: (
        <Card className="max-w-4xl">
          <CardTitle>Job report</CardTitle>
          <ReportPanel
            businessId={business.id}
            bookingId={booking.id}
            photos={photos}
            note={booking.report_note ?? ""}
            reportUrl={`${payLink}/report`}
            completed={booking.status === "completed"}
          />
        </Card>
      ),
    });
  }

  if (canManage || booking.internal_notes) {
    tabs.push({
      id: "notes",
      label: "Notes",
      icon: <NotebookPen />,
      badge: booking.internal_notes ? "1" : undefined,
      content: (
        <Card className="max-w-3xl">
          <CardTitle>Team notes</CardTitle>
          {canManage ? (
            <NotesForm businessId={business.id} bookingId={booking.id} notes={booking.internal_notes ?? ""} />
          ) : (
            <p className="whitespace-pre-line text-sm">{booking.internal_notes}</p>
          )}
        </Card>
      ),
    });
  }

  tabs.push({
    id: "activity",
    label: "Activity",
    icon: <History />,
    badge: String(events.length),
    content: (
      <Card className="max-w-3xl">
        <CardTitle>Timeline</CardTitle>
        <ol className="space-y-4 border-l-2 border-line pl-4 text-sm" data-testid="job-timeline">
          {events.map((event) => {
            const described = describeJobEvent(event, { timeZone: tz, currency: booking.currency, team });
            return (
              <li key={event.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-brand-500" aria-hidden="true" />
                <p className="font-semibold">{described.title}</p>
                {described.detail ? <p className="text-ink-soft">{described.detail}</p> : null}
                <p className="text-ink-faint">{formatDateTime(event.created_at, tz)}</p>
              </li>
            );
          })}
        </ol>
      </Card>
    ),
  });

  return (
    <>
      <Link href={routes.bookings} className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Bookings
      </Link>

      <header className="mb-6 rounded-[1.5rem] border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-tag text-ink-faint">Job {booking.reference}</p>
            <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{customerName}</h1>
            <p className="mt-2 inline-flex items-center gap-1.5 text-ink-soft">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              {formatDateLong(toDateKey(start, tz))}, {formatTime(start, tz)} – {formatTime(booking.scheduled_end, tz)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <BookingStatusBadge status={booking.status} />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-2.5 py-1 text-xs font-semibold text-ink-soft">
                <UserRound className="size-3.5" aria-hidden="true" />
                {assignee?.name ?? "Unassigned"}
              </span>
              {canManage && (booking.total_cents ?? 0) > 0 ? (
                <span className="rounded-full bg-paper-deep px-2.5 py-1 text-xs font-semibold text-ink-soft">
                  {money(booking.total_cents ?? 0)}
                  {balance > 0 ? ` · ${money(balance)} due` : " · paid"}
                </span>
              ) : null}
            </div>
          </div>
          <JobActionBar
            businessId={business.id}
            bookingId={booking.id}
            status={booking.status}
            canManage={canManage}
            isAssignedToMe={booking.assigned_member_id === memberId}
            customerName={customerName}
          />
        </div>
        <QuickActions phone={booking.customers?.phone ?? null} directionsUrl={address ? directionsUrl(address) : null} payLink={canManage ? payLink : null} />
      </header>

      {booking.status === "pending_payment" && booking.hold_expires_at ? (
        <p className="mb-6 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm" data-testid="hold-notice">
          <strong>Waiting for the deposit.</strong> The time is held until {formatTime(booking.hold_expires_at, tz)}. If it isn&apos;t paid by then, the time is
          released and the customer gets an email to pick a new one.
        </p>
      ) : null}
      {booking.cancel_requested_at && canManage ? (
        <section className="mb-6 rounded-2xl border border-clay/40 bg-clay-soft/60 p-4" data-testid="cancel-request" aria-labelledby="cancel-request-heading">
          <h2 id="cancel-request-heading" className="font-bold">
            {customerName} asked to cancel
          </h2>
          <p className="mt-1 text-sm">
            Requested {formatDateTime(booking.cancel_requested_at, tz)}.
            {booking.cancel_request_reason ? <> &ldquo;{booking.cancel_request_reason}&rdquo;</> : null}
          </p>
          <div className="mt-3">
            <CancelRequestControls
              businessId={business.id}
              bookingId={booking.id}
              name={customerName}
              paidCents={booking.deposit_paid_cents}
              currency={booking.currency}
              refundByDefault={refundByDefault(business.deposit_refund_policy, booking.cancel_requested_at, booking.scheduled_start, business.cancellation_window_hours)}
            />
          </div>
        </section>
      ) : null}
      {booking.status === "cancelled" && booking.cancellation_reason ? (
        <p className="mb-6 rounded-2xl border border-line bg-paper-deep/60 px-4 py-3 text-sm" data-testid="cancel-reason">
          <strong>Cancelled:</strong>{" "}
          {booking.cancellation_reason === "Payment hold expired" ? "the deposit wasn't paid within 30 minutes, so the time was released." : booking.cancellation_reason}
        </p>
      ) : null}

      <Tabs label="Job sections" items={tabs} />
    </>
  );
}

type JobAddress = Parameters<typeof formatAddress>[0] & { lat: number | null; lng: number | null };

function directionsUrl(address: JobAddress) {
  const destination = address.lat != null ? `${address.lat},${address.lng}` : formatAddress(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Thumb-sized shortcuts for the things you do from the driveway, in one row. */
function QuickActions({ phone, directionsUrl: directions, payLink }: { phone: string | null; directionsUrl: string | null; payLink: string | null }) {
  if (!phone && !directions && !payLink) return null;
  const action =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink hover:border-ink-faint sm:flex-none";
  return (
    <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4" aria-label="Quick actions" role="group">
      {phone ? (
        <>
          <a href={`tel:${phone}`} className={action}>
            <Phone className="size-4 text-brand-600" aria-hidden="true" />
            Call
          </a>
          <a href={`sms:${phone}`} className={action}>
            <MessageSquareText className="size-4 text-brand-600" aria-hidden="true" />
            Text
          </a>
        </>
      ) : null}
      {directions ? (
        <a href={directions} target="_blank" rel="noreferrer" className={action}>
          <Navigation className="size-4 text-brand-600" aria-hidden="true" />
          Directions
        </a>
      ) : null}
      {payLink ? <CopyButton value={payLink} label="Copy payment link" /> : null}
    </div>
  );
}
