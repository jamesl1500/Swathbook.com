import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import { loadBookingOptions, loadCustomerBooking, type BookingOptions, type CustomerBooking } from "@/libs/customer-booking";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { noIndex } from "@/libs/seo";
import { hasStripe } from "@/libs/stripe/server";
import { brandTextColor } from "@/libs/utils";
import { BookingPanel } from "./booking-panel";

export const metadata: Metadata = { title: "Your booking", robots: noIndex };

export default function CustomerBookingPage({ params, searchParams }: PageProps<"/booking/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 h-96 max-w-2xl animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <BookingDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BookingDetails({
  params,
  searchParams,
}: {
  params: PageProps<"/booking/[token]">["params"];
  searchParams: PageProps<"/booking/[token]">["searchParams"];
}) {
  const [{ token }, { paid }] = await Promise.all([params, searchParams]);
  const [booking, options] = await Promise.all([loadCustomerBooking(token), loadBookingOptions(token)]);
  if (!booking || !booking.businesses) notFound();
  return <BookingView booking={booking} options={options} justPaid={paid === "1"} paymentsEnabled={hasStripe()} />;
}

function BookingView({
  booking,
  options,
  justPaid,
  paymentsEnabled,
}: {
  booking: CustomerBooking;
  options: BookingOptions | null;
  justPaid: boolean;
  paymentsEnabled: boolean;
}) {
  const business = booking.businesses!;
  const brand = business.brand_color ?? "#1c3d70";

  return (
    <div className="min-h-dvh bg-paper">
      <header
        className="text-(color:--on-brand)"
        style={{ backgroundColor: brand, "--on-brand": brandTextColor(brand) } as React.CSSProperties}
      >
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <p className="text-sm text-(color:--on-brand)/80">Booking {booking.reference}</p>
          <h1 className="mt-1 text-3xl font-extrabold">{business.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
        <BookingPanel booking={booking} options={options} justPaid={justPaid} paymentsEnabled={paymentsEnabled} />
      </main>

      <footer className="py-8 text-center text-xs text-ink-faint">
        <Link href={routes.home} className="inline-flex items-center gap-1.5 hover:text-ink">
          <LogoMark className="size-4" />
          Booking powered by {siteConfig.name}
        </Link>
      </footer>
    </div>
  );
}
