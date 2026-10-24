import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { BookingStatusBadge, Card, CardTitle, PageHeader, Stat } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { requireBusinessContext } from "@/libs/dashboard";
import { hasGoogleMaps } from "@/libs/google/maps";
import { bookingPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { formatDateTime } from "@/libs/time";
import { formatCents } from "@/libs/utils";
import { AddressList, CustomerProfile } from "../customer-forms";

export const metadata: Metadata = { title: "Customer" };

export default function CustomerPage({ params }: PageProps<"/dashboard/customers/[customerId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Customer params={params} />
    </Suspense>
  );
}

async function Customer({ params }: { params: PageProps<"/dashboard/customers/[customerId]">["params"] }) {
  const { customerId } = await params;
  const { business, canManage } = await requireBusinessContext(routes.customers);
  if (!/^[0-9a-f-]{36}$/.test(customerId)) notFound();

  const supabase = await createClient();
  const [{ data: customer }, { data: addresses }, { data: bookings }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).eq("business_id", business.id).maybeSingle(),
    supabase
      .from("customer_addresses")
      .select("id, label, line1, line2, city, region, postal_code, lat, lng, google_place_id, access_notes, is_primary")
      .eq("customer_id", customerId)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    supabase
      .from("bookings")
      .select("id, status, scheduled_start, total_cents, amount_paid_cents, amount_refunded_cents, booking_items(name)")
      .eq("customer_id", customerId)
      .order("scheduled_start", { ascending: false })
      .limit(50),
  ]);
  if (!customer) notFound();

  const visits = bookings?.filter((booking) => booking.status === "completed").length ?? 0;
  const paid = bookings?.reduce((sum, booking) => sum + booking.amount_paid_cents - booking.amount_refunded_cents, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Customer"
        title={customer.full_name}
        description={`Customer since ${formatDateTime(customer.created_at, business.timezone).split(",").slice(0, 2).join(",")}`}
        actions={
          canManage ? (
            <Link href={`${routes.newBooking}?customer=${customer.id}`} className={buttonStyles({ size: "sm" })}>
              <CalendarPlus className="size-4" aria-hidden="true" />
              New job
            </Link>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Bookings" value={bookings?.length ?? 0} />
        <Stat label="Completed visits" value={visits} />
        {canManage ? <Stat label="Lifetime paid" value={formatCents(paid, business.currency)} /> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Contact</CardTitle>
            <CustomerProfile
              businessId={business.id}
              canManage={canManage}
              values={{
                id: customer.id,
                fullName: customer.full_name,
                email: customer.email ?? "",
                phone: customer.phone ?? "",
                notes: customer.notes ?? "",
                tags: customer.tags,
                emailOptIn: customer.email_opt_in,
                smsOptIn: customer.sms_opt_in,
              }}
            />
          </Card>
          <Card>
            <CardTitle>Addresses</CardTitle>
            <AddressList
              businessId={business.id}
              customerId={customer.id}
              addresses={addresses ?? []}
              googleEnabled={hasGoogleMaps()}
              canManage={canManage}
            />
          </Card>
        </div>

        <Card>
          <CardTitle>History</CardTitle>
          {bookings?.length ? (
            <ul className="divide-y divide-line">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <Link href={bookingPath(booking.id)} className="flex items-center gap-3 py-3 hover:bg-paper/60">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{formatDateTime(booking.scheduled_start, business.timezone)}</span>
                      <span className="block truncate text-sm text-ink-soft">{booking.booking_items.map((item) => item.name).join(", ")}</span>
                    </span>
                    {canManage ? <span className="text-sm font-semibold">{formatCents(booking.total_cents ?? 0, business.currency)}</span> : null}
                    <BookingStatusBadge status={booking.status} />
                    <ChevronRight className="size-4 text-ink-faint" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No bookings yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
