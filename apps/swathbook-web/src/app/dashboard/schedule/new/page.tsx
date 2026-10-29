import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListChecks } from "lucide-react";
import { Card, EmptyState, ManagersOnly, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { requireBusinessContext } from "@/libs/dashboard";
import { hasGoogleMaps } from "@/libs/google/maps";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { loadTeam } from "@/libs/team";
import { isDateKey, todayKey } from "@/libs/time";
import type { CustomerOption } from "../actions";
import { NewJobForm } from "./new-job-form";

export const metadata: Metadata = { title: "New job" };

export default function NewJobPage({ searchParams }: PageProps<"/dashboard/schedule/new">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <NewJob searchParams={searchParams} />
    </Suspense>
  );
}

async function NewJob({ searchParams }: { searchParams: PageProps<"/dashboard/schedule/new">["searchParams"] }) {
  const { business, canManage } = await requireBusinessContext(routes.newBooking);
  if (!canManage) return <ManagersOnly what="the schedule" />;
  const { customer: customerParam, date } = await searchParams;

  const supabase = await createClient();
  const [{ data: services }, team, { data: customer }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, price_cents, duration_minutes")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("sort_order"),
    loadTeam(business.id),
    typeof customerParam === "string" && /^[0-9a-f-]{36}$/.test(customerParam)
      ? supabase
          .from("customers")
          .select("id, full_name, email, phone, customer_addresses(id, line1, city, is_primary)")
          .eq("id", customerParam)
          .eq("business_id", business.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const initialCustomer: CustomerOption | null = customer
    ? {
        id: customer.id,
        fullName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        addresses: customer.customer_addresses.map((address) => ({ id: address.id, line1: address.line1, city: address.city, isPrimary: address.is_primary })),
      }
    : null;

  return (
    <>
      <PageHeader eyebrow="Schedule" title="New job" description="For bookings that come in by phone, text or in person." />
      {services?.length ? (
        <Card className="max-w-3xl">
          <NewJobForm
            businessId={business.id}
            services={services}
            team={team.filter((person) => person.isBookable).map((person) => ({ id: person.id, name: person.name }))}
            currency={business.currency}
            defaultDate={typeof date === "string" && isDateKey(date) ? date : todayKey(business.timezone)}
            googleEnabled={hasGoogleMaps()}
            initialCustomer={initialCustomer}
          />
        </Card>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Add a service first"
          action={
            <Link href={routes.services} className={buttonStyles({ size: "sm" })}>
              Go to services
            </Link>
          }
        >
          Jobs are made of services, so set up at least one.
        </EmptyState>
      )}
    </>
  );
}
