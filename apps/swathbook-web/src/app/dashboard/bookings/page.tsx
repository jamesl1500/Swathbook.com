import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { BookingStatusBadge, EmptyState, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { refundByDefault } from "@/libs/booking-policy";
import { requireBusinessContext } from "@/libs/dashboard";
import { bookingPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import type { Database } from "@/libs/supabase/database.types";
import { loadTeam } from "@/libs/team";
import { addDays, dayRangeUtc, formatDateShort, formatTime, isDateKey, todayKey } from "@/libs/time";
import { cn, formatCents, formatDuration } from "@/libs/utils";
import { CancelRequestControls, RequestControls } from "./booking-actions";
import { RowActions } from "./row-actions";
import { dayLabel, groupByDay } from "./day-groups";

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

  // One tab bar, in the order people work through it. Counts that need a decision stand out.
  const tabs: Array<{ key: View; count?: number; urgent?: boolean }> = [
    { key: "upcoming", count: tabCounts.upcoming },
    ...(canManage
      ? [
          { key: "requests" as const, count: tabCounts.requests, urgent: true },
          { key: "cancel" as const, count: tabCounts.cancel_requests, urgent: true },
        ]
      : []),
    { key: "deposit", count: tabCounts.awaiting_deposit },
    { key: "past" },
    { key: "all" },
  ];

  // Filters beyond search live in a panel; it starts open when one is in use.
  const moreFilters = Boolean(status || from || to || (canManage && member));
  // Each active filter as a removable chip: what it says, and which parameter it clears.
  const chips: Array<{ label: string; param: string }> = [];
  if (status) chips.push({ label: `Status: ${ALL_STATUSES.find((option) => option.value === status)?.label}`, param: "status" });
  if (canManage && member) chips.push({ label: `Assigned: ${member === "unassigned" ? "Unassigned" : (names.get(member) ?? "Team member")}`, param: "member" });
  if (from) chips.push({ label: `From ${formatDateShort(from)}`, param: "from" });
  if (to) chips.push({ label: `To ${formatDateShort(to)}`, param: "to" });

  const today = todayKey(tz);
  const groups = groupByDay(rows ?? [], tz);

  return (
    <>
      <PageHeader
        title="Bookings"
        description={canManage ? `${todaySummary(tabCounts.today)} Filter, find a customer, and handle requests.` : "Your jobs, upcoming and past."}
        actions={
          canManage ? (
            <Link href={routes.newBooking} className={buttonStyles({ size: "sm" })}>
              <Plus className="size-4" aria-hidden="true" />
              New job
            </Link>
          ) : null
        }
      />

      {/* Scrolls sideways on narrow phones rather than wrapping, like the dashboard's other tabs. */}
      <nav aria-label="Booking views" className="mb-5 border-b border-line">
        <div data-allow-overflow className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex min-w-max gap-1">
            {tabs.map(({ key, count, urgent }) => {
              const active = key === view;
              return (
                <li key={key}>
                  <Link
                    href={href({ view: key, page: 1, status: null })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex h-12 items-center gap-2 border-b-2 px-3 text-[0.95rem] font-semibold whitespace-nowrap transition-colors sm:px-4",
                      active ? "border-brand-600 text-ink" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {VIEWS[key].label}
                    {count ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          urgent ? "bg-sun text-ink" : active ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-ink-soft",
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
        </div>
      </nav>

      {/* Keyed on the filters so the fields reset when "Clear" or a tab navigates. */}
      <Form
        key={`${view}|${search}|${status ?? ""}|${from}|${to}|${member ?? ""}`}
        action={routes.bookings}
        className="mb-5 rounded-[1.25rem] border border-line bg-card p-3 sm:p-4"
      >
        <input type="hidden" name="view" value={view} />
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-60">
            <label htmlFor="bookings-search" className="sr-only">
              Search bookings
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <Input id="bookings-search" name="q" defaultValue={search} placeholder="Name, phone, email or #ref" className="pl-10" />
          </div>
          <button type="submit" className={buttonStyles({ variant: "secondary", className: "min-h-11" })}>
            Filter
          </button>
          {filtersActive ? (
            <Link href={href({ q: null, status: null, from: null, to: null, member: null, page: 1 })} className={buttonStyles({ variant: "ghost", className: "min-h-11" })}>
              Clear
            </Link>
          ) : null}
        </div>

        <details open={moreFilters} className="group mt-2">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            More filters
            {chips.length ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{chips.length}</span> : null}
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="bookings-status" className="mb-1 block text-xs font-semibold text-ink-soft">
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
                <label htmlFor="bookings-member" className="mb-1 block text-xs font-semibold text-ink-soft">
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
              <label htmlFor="bookings-from" className="mb-1 block text-xs font-semibold text-ink-soft">
                From
              </label>
              <Input id="bookings-from" name="from" type="date" defaultValue={from} />
            </div>
            <div>
              <label htmlFor="bookings-to" className="mb-1 block text-xs font-semibold text-ink-soft">
                To
              </label>
              <Input id="bookings-to" name="to" type="date" defaultValue={to} />
            </div>
          </div>
        </details>

        {chips.length ? (
          <ul aria-label="Active filters" className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.label}>
                <Link
                  href={href({ [chip.param]: null, page: 1 })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper-deep px-3 text-sm font-semibold text-ink-soft hover:text-ink"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.label}
                  <X className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Form>

      {rows?.length ? (
        <>
          <p className="mb-3 text-sm text-ink-soft" data-testid="result-count">
            {total === 1 ? "1 booking" : `${total} bookings`}
            {total > PAGE_SIZE ? ` · showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}` : ""}
          </p>
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.dateKey} aria-labelledby={`day-${group.dateKey}`}>
                <h2 id={`day-${group.dateKey}`} className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <span className={cn("font-display text-lg font-bold", group.dateKey === today && "text-brand-600")}>{dayLabel(group.dateKey, today)}</span>
                  {dayLabel(group.dateKey, today) === formatDateShort(group.dateKey) ? null : (
                    <span className="text-sm text-ink-soft">{formatDateShort(group.dateKey)}</span>
                  )}
                  <span className="text-sm text-ink-faint">· {group.rows.length === 1 ? "1 job" : `${group.rows.length} jobs`}</span>
                </h2>
                <ul className="space-y-3">
                  {group.rows.map((row) => (
                    <li key={row.id} className="rounded-[1.25rem] border border-line bg-card" data-testid="booking-row">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:p-5">
                        <div className="w-20 shrink-0">
                          <p className="font-display text-lg font-bold leading-tight">{formatTime(row.scheduled_start, tz)}</p>
                          <p className="text-xs text-ink-faint">{formatDuration(minutesBetween(row.scheduled_start, row.scheduled_end))}</p>
                        </div>
                        <div className="min-w-0 flex-1 basis-48">
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
                        <div className="flex flex-col items-start gap-1 sm:items-end">
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
                        <RowActions
                          businessId={business.id}
                          canManage={canManage}
                          canWork={canManage || row.assigned_member_id === memberId}
                          booking={{
                            id: row.id,
                            status: row.status,
                            customerName: row.customer_name,
                            customerPhone: row.customer_phone,
                            customerEmail: row.customer_email,
                            href: bookingPath(row.id),
                            started: group.dateKey <= today,
                            cancelRequested: Boolean(row.cancel_requested_at),
                          }}
                        />
                      </div>

                      {row.cancel_requested_at && canManage ? (
                        <DecisionStrip title={`${row.customer_name} asked to cancel`} detail={row.cancel_request_reason ? `“${row.cancel_request_reason}”` : null}>
                          <CancelRequestControls
                            businessId={business.id}
                            bookingId={row.id}
                            name={row.customer_name}
                            paidCents={row.deposit_paid_cents}
                            currency={row.currency}
                            refundByDefault={refundByDefault(business.deposit_refund_policy, row.cancel_requested_at, row.scheduled_start, business.cancellation_window_hours)}
                            compact
                          />
                        </DecisionStrip>
                      ) : row.status === "requested" && canManage ? (
                        <DecisionStrip title="Waiting for your OK" detail={`${row.customer_name} asked for this time.`}>
                          <RequestControls businessId={business.id} bookingId={row.id} name={row.customer_name} />
                        </DecisionStrip>
                      ) : row.status === "pending_payment" && row.hold_expires_at ? (
                        <p className="border-t border-line px-4 py-3 text-sm text-ink-soft sm:px-5">
                          Waiting for the deposit until {formatTime(row.hold_expires_at, tz)}.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

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

function todaySummary(count: number | undefined) {
  if (!count) return "Nothing on today.";
  return count === 1 ? "1 job today." : `${count} jobs today.`;
}

function minutesBetween(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
}

/** A decision waiting on the owner (a request, or a cancellation request), under its job. */
function DecisionStrip({ title, detail, children }: { title: string; detail: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-[1.25rem] border-t border-sun/60 bg-sun-soft/60 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        {detail ? <p className="text-sm text-ink-soft">{detail}</p> : null}
      </div>
      {children}
    </div>
  );
}
