import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Store } from "lucide-react";
import { BookingPanel } from "@/app/booking/[token]/booking-panel";
import { loadMyJob } from "@/libs/customer";
import { loadBookingOptions, loadCustomerBooking } from "@/libs/customer-booking";
import { businessPagePath, customerJobPath, routes } from "@/libs/routes";
import { readPaymentReturn } from "@/libs/payment-return";
import { hasStripe } from "@/libs/stripe/server";

export const metadata: Metadata = { title: "Job details" };

export default function CustomerJobPage({ params, searchParams }: PageProps<"/my/jobs/[id]">) {
  return (
    <>
      <Link href={routes.customerJobs} className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        My jobs
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.5rem] bg-paper-deep" aria-busy="true" />}>
        <JobDetail params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function JobDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/my/jobs/[id]">["params"];
  searchParams: PageProps<"/my/jobs/[id]">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // my_booking answers only for the signed-in customer's own bookings, so this
  // is the ownership check. Someone else's id looks exactly like a missing one.
  const job = await loadMyJob(id);
  if (!job) notFound();

  // From here on the booking's own token is the key, exactly as on the emailed
  // manage-booking page, so both follow the same reschedule, cancel and payment rules.
  const [booking, options] = await Promise.all([loadCustomerBooking(job.public_token), loadBookingOptions(job.public_token)]);
  if (!booking?.businesses) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-sm text-ink-soft">Booking {booking.reference}</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight sm:text-4xl">{booking.businesses.name}</h1>
      </div>
      <BookingPanel
        booking={booking}
        options={options}
        paymentReturn={readPaymentReturn(query)}
        paymentsEnabled={hasStripe()}
        paymentReturnPath={customerJobPath(job.id)}
      />
      {job.business.is_bookable ? (
        <Link href={businessPagePath(job.business.slug)} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
          <Store className="size-4" aria-hidden="true" />
          Book {job.business.name} again
        </Link>
      ) : null}
    </div>
  );
}
