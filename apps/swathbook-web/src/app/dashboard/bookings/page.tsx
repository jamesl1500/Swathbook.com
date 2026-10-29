import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Plus, Search } from "lucide-react";
import { BookingStatusBadge, EmptyState, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { refundByDefault } from "@/libs/booking-policy";
import { requireBusinessContext } from "@/libs/dashboard";
import { bookingPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import type { Database } from "@/libs/supabase/database.types";
import { loadTeam } from "@/libs/team";
import { addDays, dayRangeUtc, formatDateShort, formatTime, isDateKey, toDateKey, todayKey } from "@/libs/time";
import { cn, formatCents } from "@/libs/utils";
import { CancelRequestControls, RequestControls } from "./booking-actions";

export const metadata: Metadata = { title: "Bookings" };

type BookingStatus = Database["public"]["Enums"]["booking_status"];
const PAGE_SIZE = 25;
const ACTIVE: BookingStatus[] = ["pending_payment", "requested", "confirmed", "in_progress"];
const ALL_STATUSES: Array<{ value: BookingStatus; label: string }> = [
  { value: "confirmed", label: "Confirmed" },
  { value: "requested", label: "Requests" },
  { value: "pending_payment", label: "Awaiting deposit" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const VIEWS = {
  upcoming: { label: "Upcoming", empty: "No upcoming bookings yet. Share your booking link or add a job." },
  requests: { label: "Requests", empty: "No requests waiting. Bookings that need your OK show up here." },
  cancel: { label: "Cancel requests", empty: "No one has asked to cancel." },
  deposit: { label: "Awaiting deposit", empty: "No one is mid-checkout right now." },
  past: { label: "Past", empty: "Nothing in the past yet." },
  all: { label: "All", empty: "No bookings match these filters." },
} as const;
type View = keyof typeof VIEWS;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookingsPage({ searchParams }: PageProps<"/dashboard/bookings">) {
  return (
    <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({ searchParams }: { searchParams: PageProps<"/dashboard/bookings">["searchParams"] }) {
  const { business, canManage, memberId } = await requireBusinessContext(routes.bookings);
  const query = await searchParams;
  const view: View = param(query.view) in VIEWS ? (param(query.view) as View) : "upcoming";
  const search = param(query.q).slice(0, 80);
  const status = ALL_STATUSES.some((option) => option.value === param(query.status)) ? (param(query.status) as BookingStatus) : null;
  const from = isDateKey(param(query.from)) ? param(query.from) : "";
  const to = isDateKey(param(query.to)) ? param(query.to) : "";
  // Crew only ever see their own jobs.
  const member = canManage ? param(query.member) : memberId;
  const page = Math.max(1, Number.parseInt(param(query.page), 10) || 1);
  const tz = business.timezone;
  const now = new Date();

  const statuses: BookingStatus[] | null = status
    ? [status]
    : view === "upcoming"
      ? ACTIVE
      : view === "requests"
        ? ["requested"]
        : view === "deposit"
          ? ["pending_payment"]
          : view === "cancel"
            ? ["confirmed", "requested", "in_progress"]
            : null;
  let rangeFrom = from ? dayRangeUtc(from, addDays(from, 1), tz).start : null;
  let rangeTo = to ? dayRangeUtc(to, addDays(to, 1), tz).end : null;
  if (view === "upcoming" && !rangeFrom) rangeFrom = now;
  if (view === "past" && !rangeTo) rangeTo = now;

  const supabase = await createClient();
  const [{ data: rows }, { data: counts }, team] = await Promise.all([
    supabase.rpc("booking_list", {
      p_business_id: business.id,
      p_statuses: statuses ?? undefined,
      p_from: rangeFrom?.toISOString(),
      p_to: rangeTo?.toISOString(),
      p_member_id: member && member !== "unassigned" ? member : undefined,
      p_unassigned: member === "unassigned",
      p_cancel_requests: view === "cancel",
      p_search: search || undefined,
      p_newest_first: view === "past" || view === "all",
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("booking_counts", { p_business_id: business.id }),
    loadTeam(business.id),
  ]);
  const total = Number(rows?.[0]?.total_count ?? 0);
  const tabCounts = (counts ?? {}) as Record<string, number>;
  const names = new Map(team.map((person) => [person.id, person.name]));
  const filtersActive = Boolean(search || status || from || to || (canManage && member));

  const href = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | number | null> = { view, q: search, status, from, to, member: canManage ? member : null, page, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value === null || value === "" || (key === "view" && value === "upcoming") || (key === "page" && value === 1)) continue;
      next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `${routes.bookings}?${qs}` : routes.bookings;
  };

  const tabs: Array<{ key: View; count?: number }> = [
    { key: "upcoming", count: tabCounts.upcoming },
    ...(canManage ? [{ key: "requests" as const, count: tabCounts.requests }, { key: "cancel" as const, count: tabCounts.cancel_requests }] : []),
    { key: "deposit", count: tabCounts.awaiting_deposit },
    { key: "past" },
    { key: "all" },
  ];

  return (
    <>
      <PageHeader
        title="Bookings"
        description={canManage ? "Every booking in one list. Filter, find a customer, and handle requests." : "Your jobs, upcoming and past."}
        actions={
          canManage ? (
            <Link href={routes.newBooking} className={buttonStyles({ size: "sm" })}>
              <Plus className="size-4" aria-hidden="true" />
              New job
            </Link>
          ) : null
        }
      />

      {/* Wraps on phones rather than scrolling, so every view stays in sight. */}
      <nav aria-label="Booking views" className="mb-4">
        <ul className="flex flex-wrap gap-1.5">
          {tabs.map(({ key, count }) => {
            const active = key === view;
            return (
              <li key={key}>
                <Link
                  href={href({ view: key, page: 1, status: null })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                    active ? "border-brand-600 bg-brand-600 text-paper" : "border-line bg-card text-ink-soft hover:text-ink",
                  )}
                >
                  {VIEWS[key].label}
                  {count ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        active ? "bg-paper/20 text-paper" : key === "requests" || key === "cancel" ? "bg-sun text-ink" : "bg-paper-deep text-ink-soft",
                      )}
                      data-testid={`count-${key}`}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Keyed on the filters so the fields reset when "Clear" or a tab navigates. */}
      <Form key={`${view}|${search}|${status ?? ""}|${from}|${to}|${member ?? ""}`} action={routes.bookings} className="mb-5 grid gap-3 rounded-[1.25rem] border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
        <input type="hidden" name="view" value={view} />
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="bookings-search" className="sr-only">
            Search bookings
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <Input id="bookings-search" name="q" defaultValue={search} placeholder="Name, phone, email or #ref" className="pl-10" />
        </div>
        <div>
          <label htmlFor="bookings-status" className="sr-only">
            Status
          </label>
          <Select id="bookings-status" name="status" defaultValue={status ?? ""}>
            <option value="">Any status</option>
            {ALL_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        {canManage ? (
          <div>
            <label htmlFor="bookings-member" className="sr-only">
              Assigned to
            </label>
            <Select id="bookings-member" name="member" defaultValue={member}>
              <option value="">Anyone</option>
              {team.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
              <option value="unassigned">Unassigned</option>
            </Select>
          </div>
        ) : null}
        <div>
          <label htmlFor="bookings-from" className="sr-only">
            From
          </label>
          <Input id="bookings-from" name="from" type="date" defaultValue={from} aria-label="From date" />
        </div>
        <div>
          <label htmlFor="bookings-to" className="sr-only">
            To
          </label>
          <Input id="bookings-to" name="to" type="date" defaultValue={to} aria-label="To date" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonStyles({ variant: "secondary", className: "min-h-11 flex-1 lg:flex-none" })}>
            Filter
          </button>
          {filtersActive ? (
            <Link href={href({ q: null, status: null, from: null, to: null, member: null, page: 1 })} className={buttonStyles({ variant: "ghost", className: "min-h-11" })}>
              Clear
            </Link>
          ) : null}
        </div>
      </Form>

      {rows?.length ? (
        <>
          <p className="mb-3 text-sm text-ink-soft" data-testid="result-count">
            {total === 1 ? "1 booking" : `${total} bookings`}
            {total > PAGE_SIZE ? ` · showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}` : ""}
          </p>
          <ul className="space-y-3">
            {rows.map((row) => {
              const dateKey = toDateKey(new Date(row.scheduled_start), tz);
              const isToday = dateKey === todayKey(tz);
              return (
                <li key={row.id} className="rounded-[1.25rem] border border-line bg-card p-4 sm:p-5" data-testid="booking-row">
                  <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
                    <div className="w-28 shrink-0">
                      <p className={cn("font-display text-lg font-bold leading-tight", isToday && "text-brand-600")}>
                        {isToday ? "Today" : formatDateShort(dateKey)}
                      </p>
                      <p className="text-sm font-semibold text-ink-soft">{formatTime(row.scheduled_start, tz)}</p>
                    </div>
                    <div className="min-w-0 flex-1 basis-56">
                      <Link href={bookingPath(row.id)} className="font-bold hover:underline">
                        {row.customer_name}
                      </Link>
                      <p className="truncate text-sm text-ink-soft">{row.services || "Service visit"}</p>
                      <p className="mt-1 text-xs text-ink-faint">
                        #{row.reference}
                        {canManage ? ` · ${row.assigned_member_id ? names.get(row.assigned_member_id) ?? "Team member" : "Unassigned"}` : ""}
                        {row.source === "booking_page" ? " · Booked online" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-1.5 sm:items-end">
                      <div className="flex flex-wrap gap-1.5">
                        <BookingStatusBadge status={row.status} />
                        {row.cancel_requested_at ? (
                          <span className="rounded-full bg-clay-soft px-2.5 py-1 text-xs font-semibold text-clay-ink">Cancel requested</span>
                        ) : null}
                      </div>
                      {canManage && (row.total_cents ?? 0) > 0 ? (
                        <p className="text-sm text-ink-soft">
                          {formatCents(row.total_cents ?? 0, row.currency)}
                          {row.deposit_paid_cents > 0 ? ` · ${formatCents(row.deposit_paid_cents, row.currency)} paid` : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {row.cancel_requested_at && canManage ? (
                    <div className="mt-4 border-t border-line pt-4">
                      {row.cancel_request_reason ? <p className="mb-3 text-sm">&ldquo;{row.cancel_request_reason}&rdquo;</p> : null}
                      <CancelRequestControls
                        businessId={business.id}
                        bookingId={row.id}
                        name={row.customer_name}
                        paidCents={row.deposit_paid_cents}
                        currency={row.currency}
                        refundByDefault={refundByDefault(business.deposit_refund_policy, row.cancel_requested_at, row.scheduled_start, business.cancellation_window_hours)}
                        compact
                      />
                    </div>
                  ) : row.status === "requested" && canManage ? (
                    <div className="mt-4 border-t border-line pt-4">
                      <RequestControls businessId={business.id} bookingId={row.id} name={row.customer_name} />
                    </div>
                  ) : row.status === "pending_payment" && row.hold_expires_at ? (
                    <p className="mt-3 text-sm text-ink-soft">Waiting for the deposit until {formatTime(row.hold_expires_at, tz)}.</p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {total > PAGE_SIZE ? (
            <nav aria-label="Pages" className="mt-5 flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className={buttonStyles({ variant: "secondary", size: "sm", className: "min-h-11" })}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-ink-soft">
                Page {page} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              {page * PAGE_SIZE < total ? (
                <Link href={href({ page: page + 1 })} className={buttonStyles({ variant: "secondary", size: "sm", className: "min-h-11" })}>
                  More
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState icon={ClipboardList} title={filtersActive ? "No bookings match" : VIEWS[view].label}>
          {filtersActive ? "Try clearing a filter." : VIEWS[view].empty}
        </EmptyState>
      )}
    </>
  );
}
