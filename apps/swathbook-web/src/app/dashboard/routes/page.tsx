import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Navigation, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { formatAddress } from "@/libs/address";
import { requireBusinessContext } from "@/libs/dashboard";
import { hasGoogleMaps, navigationUrl } from "@/libs/google/maps";
import { bookingPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { loadTeam, type TeamMember } from "@/libs/team";
import { addDays, dayRangeUtc, formatDateLong, formatTime, isDateKey, todayKey } from "@/libs/time";
import { cn } from "@/libs/utils";
import { PlanRouteButton, StopControls } from "./route-controls";

export const metadata: Metadata = { title: "Routes" };

export default function RoutesPage({ searchParams }: PageProps<"/dashboard/routes">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Routes searchParams={searchParams} />
    </Suspense>
  );
}

const METERS_PER_MILE = 1609.344;

function miles(meters: number | null) {
  return meters == null ? "—" : `${(meters / METERS_PER_MILE).toFixed(1)} mi`;
}

function driveTime(seconds: number | null) {
  if (seconds == null) return "—";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

async function Routes({ searchParams }: { searchParams: PageProps<"/dashboard/routes">["searchParams"] }) {
  const { business, canManage, memberId: myMemberId } = await requireBusinessContext(routes.dayRoutes);
  const { date: dateParam } = await searchParams;
  const today = todayKey(business.timezone);
  const date = typeof dateParam === "string" && isDateKey(dateParam) ? dateParam : today;
  const { start, end } = dayRangeUtc(date, addDays(date, 1), business.timezone);

  const supabase = await createClient();
  const [team, { data: jobs }, { data: dayRoutes }] = await Promise.all([
    loadTeam(business.id),
    supabase
      .from("bookings")
      .select("id, assigned_member_id")
      .eq("business_id", business.id)
      .in("status", ["confirmed", "in_progress"])
      .gte("scheduled_start", start.toISOString())
      .lt("scheduled_start", end.toISOString()),
    supabase
      .from("routes")
      .select(
        `id, member_id, status, optimized_at, total_distance_meters, total_duration_seconds, baseline_duration_seconds, start_lat, start_lng, optimization_meta,
         route_stops(id, sequence, status, planned_arrival, booking_id,
           bookings(id, scheduled_start, status, customers(full_name), customer_addresses(line1, line2, city, region, postal_code, lat, lng, access_notes)))`,
      )
      .eq("business_id", business.id)
      .eq("route_date", date),
  ]);

  const crew = team.filter((person) => person.isBookable && (canManage || person.id === myMemberId));
  const unassigned = (jobs ?? []).filter((job) => !job.assigned_member_id).length;
  const dateHref = (key: string) => `${routes.dayRoutes}?date=${key}`;

  return (
    <>
      <PageHeader title="Routes" description={`${formatDateLong(date)}. Stops are ordered to cut driving while keeping each customer's time.`} />

      <div className="mb-6 flex flex-wrap items-center gap-1">
        <Link href={dateHref(addDays(date, -1))} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label="Previous day">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <Link href={dateHref(today)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Today
        </Link>
        <Link href={dateHref(addDays(today, 1))} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Tomorrow
        </Link>
        <Link href={dateHref(addDays(date, 1))} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label="Next day">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {canManage && unassigned ? (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-sun/60 bg-sun-soft px-5 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {unassigned} {unassigned === 1 ? "job isn't" : "jobs aren't"} assigned to anyone that day, so {unassigned === 1 ? "it won't" : "they won't"} be routed.{" "}
            <Link href={`${routes.schedule}?member=unassigned`} className="font-semibold underline underline-offset-2">
              Assign jobs
            </Link>
          </span>
        </div>
      ) : null}

      {!hasGoogleMaps() ? (
        <p className="mb-6 rounded-2xl border border-line bg-card px-5 py-3 text-sm text-ink-soft">
          Using estimated drive times. Add <code className="rounded bg-paper-deep px-1.5 py-0.5">GOOGLE_MAPS_API_KEY</code> for real road times,
          address lookup and route maps.
        </p>
      ) : null}

      {crew.length ? (
        <div className="space-y-6">
          {crew.map((person) => (
            <MemberRoute
              key={person.id}
              person={person}
              businessId={business.id}
              date={date}
              timeZone={business.timezone}
              canManage={canManage}
              jobCount={(jobs ?? []).filter((job) => job.assigned_member_id === person.id).length}
              route={dayRoutes?.find((route) => route.member_id === person.id) ?? null}
              mapsEnabled={hasGoogleMaps()}
              isMe={person.id === myMemberId}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={RouteIcon} title="No one to route">
          Routes are planned per crew member. Make sure team members are marked as bookable.
        </EmptyState>
      )}
    </>
  );
}

type DayRoute = {
  id: string;
  status: string;
  optimized_at: string | null;
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
  baseline_duration_seconds: number | null;
  start_lat: number | null;
  start_lng: number | null;
  optimization_meta: unknown;
  route_stops: Array<{
    id: string;
    sequence: number;
    status: string;
    planned_arrival: string | null;
    booking_id: string;
    bookings: {
      id: string;
      scheduled_start: string;
      status: string;
      customers: { full_name: string } | null;
      customer_addresses: {
        line1: string;
        line2: string | null;
        city: string | null;
        region: string | null;
        postal_code: string | null;
        lat: number | null;
        lng: number | null;
        access_notes: string | null;
      } | null;
    } | null;
  }>;
};

function MemberRoute({
  person,
  businessId,
  date,
  timeZone,
  canManage,
  jobCount,
  route,
  mapsEnabled,
  isMe,
}: {
  person: TeamMember;
  businessId: string;
  date: string;
  timeZone: string;
  canManage: boolean;
  jobCount: number;
  route: DayRoute | null;
  mapsEnabled: boolean;
  isMe: boolean;
}) {
  const stops = [...(route?.route_stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const activeStops = stops.filter((stop) => stop.bookings && stop.bookings.status !== "cancelled");
  const stale = Boolean(route) && activeStops.length !== jobCount;
  const saved = route?.baseline_duration_seconds != null && route.total_duration_seconds != null ? route.baseline_duration_seconds - route.total_duration_seconds : 0;
  const meta = (route?.optimization_meta ?? {}) as { excluded?: string[]; late_minutes?: number };
  const points = activeStops
    .map((stop) => stop.bookings?.customer_addresses)
    .filter((address): address is NonNullable<typeof address> & { lat: number; lng: number } => address?.lat != null && address.lng != null)
    .map((address) => ({ lat: address.lat, lng: address.lng }));
  const navigate = navigationUrl(points, route?.start_lat != null && route.start_lng != null ? { lat: route.start_lat, lng: route.start_lng } : null);

  return (
    <Card data-testid="member-route">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-3 rounded-full" style={{ backgroundColor: person.color ?? undefined }} aria-hidden="true" />
          <h2 className="text-lg font-bold">{person.name}</h2>
          <span className="text-sm text-ink-soft">
            {jobCount} {jobCount === 1 ? "job" : "jobs"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {navigate && route ? (
            <a href={navigate} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "accent", size: "sm" })}>
              <Navigation className="size-4" aria-hidden="true" />
              Start navigation
            </a>
          ) : null}
          {canManage && jobCount > 0 ? <PlanRouteButton businessId={businessId} memberId={person.id} date={date} replan={Boolean(route)} /> : null}
        </div>
      </div>

      {!route ? (
        <p className="mt-4 rounded-xl bg-paper px-4 py-5 text-sm text-ink-soft">
          {jobCount === 0
            ? "No confirmed jobs this day."
            : canManage
              ? "Not planned yet. Plan the route to get the best order and arrival times."
              : "Your route hasn't been planned yet."}
        </p>
      ) : (
        <>
          {stale ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-sun/60 bg-sun-soft px-4 py-2.5 text-sm">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              Jobs changed since this route was planned. Re-plan to include them.
            </p>
          ) : null}

          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-paper px-3 py-3">
              <dt className="label-tag text-ink-faint">Driving</dt>
              <dd className="mt-1 font-display text-xl font-bold">{driveTime(route.total_duration_seconds)}</dd>
            </div>
            <div className="rounded-xl bg-paper px-3 py-3">
              <dt className="label-tag text-ink-faint">Distance</dt>
              <dd className="mt-1 font-display text-xl font-bold">{miles(route.total_distance_meters)}</dd>
            </div>
            <div className="rounded-xl bg-brand-50 px-3 py-3">
              <dt className="label-tag text-brand-700">Saved</dt>
              <dd className="mt-1 font-display text-xl font-bold text-brand-700" data-testid="route-saved">
                {saved > 30 ? driveTime(saved) : "Already optimal"}
              </dd>
            </div>
          </dl>

          {meta.late_minutes ? (
            <p className="mt-3 text-sm text-clay">Heads up: some arrivals land outside their arrival window. Consider moving a job.</p>
          ) : null}
          {meta.excluded?.length ? (
            <p className="mt-3 text-sm text-ink-soft">Not on the map: {meta.excluded.join(", ")}. Add a full address to include them.</p>
          ) : null}

          {mapsEnabled ? (
            // eslint-disable-next-line @next/next/no-img-element -- server-proxied Google Static Maps image
            <img src={`/api/maps/route/${route.id}`} alt={`Map of ${person.name}'s route`} className="mt-4 aspect-[16/10] w-full rounded-xl border border-line object-cover" />
          ) : null}

          <ol className="mt-4 space-y-2">
            {activeStops.map((stop) => {
              const booking = stop.bookings!;
              const address = booking.customer_addresses;
              return (
                <li
                  key={stop.id}
                  data-testid="route-stop"
                  className={cn("flex flex-wrap items-start gap-3 rounded-xl border border-line p-3", stop.status === "completed" && "border-dashed bg-paper-deep/60")}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 font-bold text-paper">{stop.sequence}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={bookingPath(booking.id)} className="font-semibold hover:underline">
                      {booking.customers?.full_name}
                    </Link>
                    <p className="text-ink-soft">{address ? formatAddress(address) : "No address"}</p>
                    <p className="text-ink-faint">
                      Arrive ~{stop.planned_arrival ? formatTime(stop.planned_arrival, timeZone) : "—"} · booked for {formatTime(booking.scheduled_start, timeZone)}
                      {stop.status !== "pending" ? ` · ${stop.status.replace("_", " ")}` : ""}
                    </p>
                    {address?.access_notes ? <p className="mt-1 rounded-lg bg-sun-soft px-2 py-1">{address.access_notes}</p> : null}
                  </div>
                  {canManage || isMe ? <StopControls businessId={businessId} stopId={stop.id} status={stop.status} /> : null}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}
