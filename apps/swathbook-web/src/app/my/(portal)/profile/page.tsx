import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { Card, CardTitle, PageHeader } from "@/components/app/ui";
import { loadMyDetails, type CustomerDetails } from "@/libs/customer";
import { DeleteAccountForm, DetailsForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

export default function CustomerProfilePage() {
  return (
    <>
      <PageHeader eyebrow="Your account" title="Profile" description="The details businesses see when you book." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.5rem] bg-paper-deep" aria-busy="true" />}>
        <Profile />
      </Suspense>
    </>
  );
}

async function Profile() {
  let details: CustomerDetails | null;
  try {
    details = await loadMyDetails();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[customer] loading details failed", error);
    details = null;
  }
  if (!details) {
    return (
      <div role="alert" className="flex gap-3 rounded-[1.25rem] border border-clay/40 bg-clay-soft p-5 text-clay-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>We couldn&apos;t load your details just now. Please refresh to try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Your details</CardTitle>
        <p className="-mt-2 mb-5 text-sm text-ink-soft">
          Signed in as <strong className="font-semibold text-ink">{details.email}</strong>
          {details.booking_count ? ` · ${details.booking_count} ${details.booking_count === 1 ? "booking" : "bookings"} with this email` : null}
        </p>
        <DetailsForm details={details} />
      </Card>
      <Card className="border-clay/30">
        <CardTitle>Delete account</CardTitle>
        <p className="-mt-2 mb-5 text-sm leading-relaxed text-ink-soft">
          Deletes your Swathbook login and saved details. Your bookings stay with each business, and you can still manage them from the links in your
          confirmation emails.
        </p>
        <DeleteAccountForm />
      </Card>
    </div>
  );
}
