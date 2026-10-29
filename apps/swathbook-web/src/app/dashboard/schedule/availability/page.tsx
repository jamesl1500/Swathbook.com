import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardTitle, ManagersOnly, PageHeader } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { loadTeam } from "@/libs/team";
import { addDays, formatDateShort, toDateKey, todayKey } from "@/libs/time";
import { HoursForm, RulesForm, TimeOffForm, TimeOffList } from "./availability-forms";

export const metadata: Metadata = { title: "Hours & time off" };

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Availability />
    </Suspense>
  );
}

async function Availability() {
  const { business, canManage } = await requireBusinessContext(routes.availability);
  if (!canManage) return <ManagersOnly what="hours and time off" />;

  const supabase = await createClient();
  const [{ data: hours }, { data: timeOff }, team] = await Promise.all([
    supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("business_id", business.id),
    supabase
      .from("time_off")
      .select("id, member_id, starts_at, ends_at, reason")
      .eq("business_id", business.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
    loadTeam(business.id),
  ]);

  const names = new Map(team.map((person) => [person.id, person.name]));
  const entries = (timeOff ?? []).map((entry) => {
    const first = toDateKey(new Date(entry.starts_at), business.timezone);
    const last = addDays(toDateKey(new Date(entry.ends_at), business.timezone), -1);
    return {
      id: entry.id,
      label: first === last ? formatDateShort(first) : `${formatDateShort(first)} – ${formatDateShort(last)}`,
      who: entry.member_id ? (names.get(entry.member_id) ?? "Crew member") : "Whole business",
      reason: entry.reason,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Hours & time off"
        description={`When customers can book you. Times are in ${business.timezone.replace(/_/g, " ")}.`}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardTitle>Weekly hours</CardTitle>
            <HoursForm businessId={business.id} hours={hours ?? []} />
          </Card>
          <Card>
            <CardTitle>Time off</CardTitle>
            <TimeOffList businessId={business.id} entries={entries} />
            <div className="mt-5 border-t border-line pt-5">
              <TimeOffForm businessId={business.id} team={team.map((person) => ({ id: person.id, name: person.name }))} defaultDate={todayKey(business.timezone)} />
            </div>
          </Card>
        </div>
        <Card>
          <CardTitle>Booking rules</CardTitle>
          <RulesForm businessId={business.id} rules={business} />
        </Card>
      </div>
    </>
  );
}
