import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDraftBusiness, listMyBusinesses, requireUser } from "@/libs/auth";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { OnboardingWizard } from "./onboarding-wizard";
import { PendingInvites } from "./pending-invites";

export const metadata: Metadata = { title: "Set up your business" };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingGate searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Reads the session, so it streams in behind the Suspense boundary.
 *
 * - Unfinished business: resume it.
 * - `?new=1`: start another business.
 * - Otherwise, anyone with a live business goes to the dashboard.
 * - Team invites waiting for this email show above setup.
 */
async function OnboardingGate({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const user = await requireUser(routes.onboarding);
  const supabase = await createClient();
  const [{ new: addingNew }, businesses, draft, { data: invites }] = await Promise.all([
    searchParams,
    listMyBusinesses(user.id),
    getDraftBusiness(user.id),
    supabase.rpc("my_pending_invitations"),
  ]);
  const hasLiveBusiness = businesses.some((business) => business.onboarding_completed_at);

  if (hasLiveBusiness && !draft && addingNew !== "1") redirect(routes.dashboard);

  return (
    <>
      {invites?.length ? <PendingInvites invites={invites} /> : null}
      <OnboardingWizard
      defaults={{
        firstName: user.fullName.split(" ")[0] ?? "",
        businessName: draft?.name ?? "",
        // The link claimed at signup only applies to someone's first business.
        slug: draft?.slug ?? (hasLiveBusiness ? "" : user.desiredSlug),
        isAdditionalBusiness: hasLiveBusiness,
      }}
    />
    </>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-14 sm:px-6" aria-busy="true" aria-label="Loading setup">
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-2 flex-1 rounded-full bg-paper-deep" />
        ))}
      </div>
      <div className="mt-12 h-10 w-2/3 max-w-lg rounded-xl bg-paper-deep" />
      <div className="mt-4 h-5 w-1/2 max-w-md rounded-lg bg-paper-deep" />
      <div className="mt-10 h-12 max-w-2xl rounded-xl bg-paper-deep" />
      <div className="mt-6 grid max-w-2xl grid-cols-3 gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-12 rounded-xl bg-paper-deep" />
        ))}
      </div>
    </div>
  );
}
