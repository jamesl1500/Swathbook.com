import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCog, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { BookingStatusBadge, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { layoutDay } from "@/libs/calendar-layout";
import { requireBusinessContext } from "@/libs/dashboard";
import { bookingPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { loadTeam } from "@/libs/team";
import { addDays, dayRangeUtc, formatDateShort, formatTime, isDateKey, minutesIntoDay, startOfWeek, toDateKey, todayKey } from "@/libs/time";
import { cn } from "@/libs/utils";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage({ searchParams }: PageProps<"/dashboard/schedule">) {
  return (
    <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Schedule searchParams={searchParams} />
    </Suspense>
  );
}

const HOUR_HEIGHT = 56;

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function cardPadding(narrow: boolean, height: number) {
  if (narrow) return "px-1 py-0.5 text-[11px]";
  return height < 36 ? "px-1.5 py-0.5" : "px-2 py-1";
}

function durationMinutes(booking: { scheduled_start: string; scheduled_end: string }) {
  return (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) / 60_000;
}

async function Schedule({ searchParams }: { searchParams: PageProps<"/dashboard/schedule">["searchParams"] }) {
  const { business, canManage, memberId: myMemberId } = await requireBusinessContext(routes.schedule);
  const { week, member } = await searchParams;
  const today = todayKey(business.timezone);
  const weekStart = startOfWeek(typeof week === "string" && isDateKey(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const { start, end } = dayRangeUtc(weekStart, addDays(weekStart, 7), business.timezone);
  const memberFilter = typeof member === "string" ? member : canManage ? "all" : myMemberId;

  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select("id, status, scheduled_start, scheduled_end, assigned_member_id, customers(full_name), customer_addresses(line1, city), booking_items(name)")
    .eq("business_id", business.id)
    .gte("scheduled_start", start.toISOString())
    .lt("scheduled_start", end.toISOString())
    .neq("status", "cancelled")
    .order("scheduled_start");
  if (memberFilter === "unassigned") query = query.is("assigned_member_id", null);
  else if (memberFilter !== "all") query = query.eq("assigned_member_id", memberFilter);

  const [{ data: bookings }, team, { data: hours }, { count: requests }] = await Promise.all([
    query,
    loadTeam(business.id),
    supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("business_id", business.id),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "requested"),
  ]);

  const colors = new Map(team.map((person) => [person.id, person.color]));
  const byDay = new Map(days.map((day) => [day, [] as NonNullable<typeof bookings>]));
  for (const booking of bookings ?? []) byDay.get(toDateKey(new Date(booking.scheduled_start), business.timezone))?.push(booking);

  // Grid spans business hours (or 7–19), widened to fit any job outside them.
  const openMinutes = (hours ?? []).map((hour) => Number(hour.opens_at.slice(0, 2)) * 60);
  const closeMinutes = (hours ?? []).map((hour) => Number(hour.closes_at.slice(0, 2)) * 60 + (hour.closes_at.slice(3, 5) === "00" ? 0 : 60));
  const jobStarts = (bookings ?? []).map((booking) => minutesIntoDay(new Date(booking.scheduled_start), business.timezone));
  const jobEnds = (bookings ?? []).map((booking) => minutesIntoDay(new Date(booking.scheduled_end), business.timezone) || 24 * 60);
  const firstHour = Math.floor(Math.min(7 * 60, ...openMinutes, ...jobStarts) / 60);
  const lastHour = Math.ceil(Math.max(19 * 60, ...closeMinutes, ...jobEnds) / 60);
  const hoursShown = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);

  const weekHref = (key: string) =>
    `${routes.schedule}?${new URLSearchParams({ week: key, ...(memberFilter !== (canManage ? "all" : myMemberId) ? { member: memberFilter } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Schedule"
        description={`${formatDateShort(days[0])} – ${formatDateShort(days[6])}`}
        actions={
          <>
            {canManage ? (
              <Link href={routes.availability} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                <CalendarCog className="size-4" aria-hidden="true" />
                Hours &amp; time off
              </Link>
            ) : null}
            {canManage ? (
              <Link href={routes.newBooking} className={buttonStyles({ size: "sm" })}>
                <Plus className="size-4" aria-hidden="true" />
                New job
              </Link>
            ) : null}
          </>
        }
      />

      {canManage && requests ? (
        <div className="mb-5 rounded-2xl border border-sun/60 bg-sun-soft px-5 py-3 text-sm">
          <strong>{requests}</strong> booking {requests === 1 ? "request is" : "requests are"} waiting for you to accept. Open one to confirm it.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={weekHref(addDays(weekStart, -7))} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label="Previous week">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
          <Link href={weekHref(startOfWeek(today))} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            This week
          </Link>
          <Link href={weekHref(addDays(weekStart, 7))} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label="Next week">
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {canManage && team.length > 1 ? (
          <Form action={routes.schedule} className="flex items-center gap-2">
            <input type="hidden" name="week" value={weekStart} />
            <label htmlFor="member-filter" className="text-sm font-semibold text-ink-soft">
              Showing
            </label>
            <Select id="member-filter" name="member" defaultValue={memberFilter} className="w-auto py-1.5">
              <option value="all">Everyone</option>
              {team.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
              <option value="unassigned">Unassigned</option>
            </Select>
            <button type="submit" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Apply
            </button>
          </Form>
        ) : null}
      </div>

      {/* Agenda: phones and tablets */}
      <ol className="space-y-4 lg:hidden" aria-label="Agenda">
        {days.map((day) => (
          <li key={day}>
            <h2 className={cn("mb-2 text-sm font-bold", day === today ? "text-brand-600" : "text-ink-soft")}>
              {formatDateShort(day)}
              {day === today ? " · Today" : ""}
            </h2>
            {byDay.get(day)!.length ? (
              <ul className="space-y-2">
                {byDay.get(day)!.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={bookingPath(booking.id)}
                      className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 hover:border-ink-faint"
                      style={{ borderLeft: `4px solid ${colors.get(booking.assigned_member_id ?? "") ?? "var(--color-line-strong)"}` }}
                    >
                      <span className="w-16 shrink-0 text-sm font-bold">{formatTime(booking.scheduled_start, business.timezone)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{booking.customers?.full_name}</span>
                        <span className="block truncate text-sm text-ink-soft">{booking.booking_items.map((item) => item.name).join(", ")}</span>
                      </span>
                      <BookingStatusBadge status={booking.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-paper-deep/50 px-3 py-2 text-sm text-ink-faint">Nothing scheduled</p>
            )}
          </li>
        ))}
      </ol>

      {/* Week grid: desktop */}
      <div className="hidden overflow-hidden rounded-[1.5rem] border border-line bg-card lg:block">
        <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-line bg-paper">
          <span />
          {days.map((day) => (
            <span key={day} className={cn("border-l border-line px-2 py-2 text-center text-sm font-bold", day === today && "text-brand-600")}>
              {formatDateShort(day)}
            </span>
          ))}
        </div>
        {/* pt-3 leaves room for the first hour label, which is centered on its line. */}
        <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] pt-3">
          <div aria-hidden="true">
            {hoursShown.map((hour) => (
              <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute right-2 top-0 -translate-y-1/2 text-xs leading-none text-ink-faint">{hourLabel(hour)}</span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayBookings = byDay.get(day)!;
            const lanes = layoutDay(
              dayBookings.map((booking) => {
                const startMinutes = minutesIntoDay(new Date(booking.scheduled_start), business.timezone);
                return { id: booking.id, start: startMinutes, end: startMinutes + durationMinutes(booking) };
              }),
            );
            return (
              <div
                key={day}
                className={cn("relative border-l border-line", day === today && "bg-brand-50/40")}
                style={{ height: hoursShown.length * HOUR_HEIGHT }}
              >
                {/* Hour lines sit exactly on multiples of HOUR_HEIGHT, the same scale jobs use. */}
                {hoursShown.map((hour, index) => (
                  <div key={hour} className="absolute inset-x-0 border-t border-line/60" style={{ top: index * HOUR_HEIGHT }} />
                ))}
                {dayBookings.map((booking) => {
                  const startMinutes = minutesIntoDay(new Date(booking.scheduled_start), business.timezone);
                  const height = Math.max((durationMinutes(booking) / 60) * HOUR_HEIGHT - 2, 20);
                  const { lane, lanes: laneCount } = lanes.get(booking.id) ?? { lane: 0, lanes: 1 };
                  const color = colors.get(booking.assigned_member_id ?? "") ?? "#7d8796";
                  const time = formatTime(booking.scheduled_start, business.timezone);
                  // Three or more side by side leaves ~40px a card: keep just "9:30" so it stays legible.
                  const narrow = laneCount >= 3;
                  const shownTime = narrow ? time.replace(/\s?[AP]M$/, "") : time;
                  const name = booking.customers?.full_name ?? "Customer";
                  const services = booking.booking_items.map((item) => item.name).join(", ");
                  return (
                    <Link
                      key={booking.id}
                      href={bookingPath(booking.id)}
                      data-testid="calendar-job"
                      title={`${time} – ${formatTime(booking.scheduled_end, business.timezone)}
${name}${services ? `
${services}` : ""}`}
                      className={cn(
                        "absolute overflow-hidden rounded-lg border text-xs leading-tight text-ink shadow-sm hover:z-10 hover:shadow-card",
                        cardPadding(narrow, height),
                        booking.status === "no_show" && "border-dashed [&_.job-name]:line-through",
                      )}
                      style={{
                        top: ((startMinutes - firstHour * 60) / 60) * HOUR_HEIGHT + 1,
                        height,
                        left: `calc(${(lane / laneCount) * 100}% + ${narrow ? 1 : 2}px)`,
                        width: `calc(${100 / laneCount}% - ${narrow ? 2 : 4}px)`,
                        // Opaque tint so overlapping or neighboring cards never show through.
                        backgroundColor: `color-mix(in srgb, ${color} 12%, var(--color-card))`,
                        borderColor: `color-mix(in srgb, ${color} 40%, var(--color-card))`,
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      {height < 36 ? (
                        <span className="block truncate">
                          <span className="font-bold">{shownTime}</span>
                          {narrow ? null : <span className="font-semibold"> {name}</span>}
                        </span>
                      ) : (
                        <>
                          <span className="block truncate font-bold">{shownTime}</span>
                          <span className="job-name block truncate font-semibold">{name}</span>
                          {height >= 50 && services ? <span className="block truncate text-ink-soft">{services}</span> : null}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {team.length > 1 ? (
        <ul className="mt-4 flex flex-wrap gap-3 text-sm text-ink-soft" aria-label="Team colors">
          {team.map((person) => (
            <li key={person.id} className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ backgroundColor: person.color ?? undefined }} />
              {person.name}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
