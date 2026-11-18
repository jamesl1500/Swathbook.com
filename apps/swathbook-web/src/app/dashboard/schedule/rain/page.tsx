import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CloudOff, CloudRain } from "lucide-react";
import { Card, CardTitle, ManagersOnly, PageHeader } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { loadRainOutlook, suggestMoveTo, type OutlookDay } from "@/libs/rain";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { addDays, formatDateShort, formatDateTime, isDateKey, todayKey, weekdayOf } from "@/libs/time";
import { cn } from "@/libs/utils";
import { RainPlanner } from "./rain-planner";

export const metadata: Metadata = { title: "Rain days" };

export default function RainDaysPage({ searchParams }: PageProps<"/dashboard/schedule/rain">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <RainDays searchParams={searchParams} />
    </Suspense>
  );
}

async function RainDays({ searchParams }: { searchParams: PageProps<"/dashboard/schedule/rain">["searchParams"] }) {
  const { business, canManage } = await requireBusinessContext(routes.rainDays);
  if (!canManage) return <ManagersOnly what="rain days" />;
  const { day } = await searchParams;

  const supabase = await createClient();
  const today = todayKey(business.timezone);
  const [outlook, { data: hours }, { data: history }] = await Promise.all([
    loadRainOutlook(supabase, business, 7),
    supabase.from("business_hours").select("weekday").eq("business_id", business.id),
    supabase
      .from("rain_delays")
      .select("id, rain_date, moved_to, moved_count, left_count, created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const days = outlook?.days ?? [];
  const openWeekdays = [...new Set((hours ?? []).map((row) => row.weekday))];
  const lastDay = addDays(today, business.booking_window_days);

  // The day to plan: the one asked for, else the first rainy day with jobs at risk.
  const picked = typeof day === "string" && isDateKey(day) && day >= today && day <= lastDay ? day : null;
  const rainDate = picked ?? days.find((entry) => entry.rainy && entry.atRisk > 0)?.date ?? null;
  const rainDay = days.find((entry) => entry.date === rainDate) ?? null;

  // Where jobs can go: the next two weeks of open days, with the forecast when known.
  const choices = Array.from({ length: 14 }, (_, index) => addDays(rainDate ?? today, index + 1))
    .filter((date) => date <= lastDay && openWeekdays.includes(weekdayOf(date)))
    .map((date) => {
      const forecast = days.find((entry) => entry.date === date)?.forecast ?? null;
      return { date, rainChance: forecast?.rainChance ?? null };
    });
  const suggested = rainDate ? suggestMoveTo(rainDate, { openWeekdays, outlook: days, lastDay }) : null;

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Rain days"
        description="Move a rainy day's outdoor jobs in one go. Customers get one email with their new time."
      />

      <Card className="mb-6">
        <CardTitle>The week ahead</CardTitle>
        {outlook?.hasForecast ? (
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Forecast">
            {days.map((entry) => (
              <li key={entry.date}>
                <ForecastTile day={entry} selected={entry.date === rainDate} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {!business.rain_alerts_enabled
              ? "Rain alerts are off (Hours & time off → Booking rules). You can still move a day's jobs below."
              : business.base_lat == null
                ? "Add where your day starts (your base address) to see the forecast. You can still move a day's jobs below."
                : "The forecast isn't available right now. You can still move a day's jobs below."}
          </p>
        )}
      </Card>

      <Card className="mb-6">
        <CardTitle>{rainDate ? `Move ${formatDateShort(rainDate)}` : "Move a day's jobs"}</CardTitle>
        <RainPlanner
          businessId={business.id}
          timeZone={business.timezone}
          today={today}
          lastDay={lastDay}
          rainDate={rainDate}
          atRisk={rainDay?.atRisk ?? null}
          forecast={rainDay?.forecast ? { chance: rainDay.forecast.rainChance, summary: rainDay.forecast.summary } : null}
          choices={choices}
          suggested={suggested}
        />
      </Card>

      {history?.length ? (
        <Card>
          <CardTitle>Recent rain days</CardTitle>
          <ul className="divide-y divide-line text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>
                  <strong>{formatDateShort(entry.rain_date)}</strong> → {formatDateShort(entry.moved_to)}
                </span>
                <span className="text-ink-soft">
                  {entry.moved_count} moved{entry.left_count ? `, ${entry.left_count} left in place` : ""} · {formatDateTime(entry.created_at, business.timezone)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function ForecastTile({ day, selected }: { day: OutlookDay; selected: boolean }) {
  const forecast = day.forecast;
  return (
    <Link
      href={`${routes.rainDays}?day=${day.date}`}
      aria-current={selected ? "date" : undefined}
      className={cn(
        "flex h-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center text-sm transition-colors",
        selected ? "border-brand-500 ring-2 ring-brand-200" : "border-line hover:border-ink-faint",
        day.rainy && day.atRisk > 0 ? "bg-brand-50" : "bg-card",
      )}
    >
      <span className="font-semibold">{formatDateShort(day.date).split(",")[0]}</span>
      <span className="text-xs text-ink-faint">{formatDateShort(day.date).split(", ")[1]}</span>
      {forecast?.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Google's weather icon
        <img src={forecast.iconUrl} alt="" className="size-8" />
      ) : (
        <CloudRain className="size-8 text-ink-faint" aria-hidden="true" />
      )}
      <span className={cn("font-display text-lg font-bold", day.rainy && "text-brand-700")}>{forecast ? `${forecast.rainChance}%` : "–"}</span>
      <span className="sr-only">chance of rain</span>
      {forecast?.summary ? <span className="line-clamp-1 text-xs text-ink-soft">{forecast.summary}</span> : null}
      <span className="mt-1 text-xs text-ink-soft">
        {day.atRisk ? `${day.atRisk} outdoor ${day.atRisk === 1 ? "job" : "jobs"}` : day.jobs ? "Indoor jobs only" : "No jobs"}
      </span>
    </Link>
  );
}
