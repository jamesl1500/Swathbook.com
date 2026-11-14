import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CalendarCheck, History, Search, TriangleAlert } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { loadMyJobs, splitJobs, type CustomerJob } from "@/libs/customer";
import { routes } from "@/libs/routes";
import { cn } from "@/libs/utils";
import { JobCard, NextJobHero } from "./job-card";

export const metadata: Metadata = { title: "My jobs" };

type View = "upcoming" | "past";

export default function CustomerJobsPage({ searchParams }: PageProps<"/my/jobs">) {
  return (
    <>
      <PageHeader eyebrow="Your bookings" title="My jobs" description="Every visit you've booked with this email, at every business." />
      <Suspense fallback={<JobsSkeleton />}>
        <Jobs searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Jobs({ searchParams }: { searchParams: PageProps<"/my/jobs">["searchParams"] }) {
  const view: View = (await searchParams).view === "past" ? "past" : "upcoming";
  let jobs: CustomerJob[];
  try {
    jobs = await loadMyJobs();
  } catch (error) {
    // Next.js signals (prerender bail-outs, redirects) aren't failures.
    unstable_rethrow(error);
    console.error("[customer] loading jobs failed", error);
    return (
      <div role="alert" className="flex gap-3 rounded-[1.25rem] border border-clay/40 bg-clay-soft p-5 text-clay-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>We couldn&apos;t load your jobs just now. Please refresh to try again.</p>
      </div>
    );
  }

  const { upcoming, past } = splitJobs(jobs);
  const shown = view === "upcoming" ? upcoming : past;

  return (
    <div className="space-y-6">
      {view === "upcoming" && upcoming[0] ? <NextJobHero job={upcoming[0]} /> : null}

      <nav aria-label="Jobs" className="flex gap-1 border-b border-line">
        {(
          [
            { id: "upcoming", label: "Upcoming", count: upcoming.length, href: routes.customerJobs },
            { id: "past", label: "Past", count: past.length, href: `${routes.customerJobs}?view=past` },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={view === tab.id ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-[0.95rem] font-semibold transition-colors sm:px-4",
              view === tab.id ? "border-brand-600 text-ink" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
            <span className={cn("rounded-full px-2 py-0.5 text-xs", view === tab.id ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-ink-soft")}>{tab.count}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        view === "upcoming" ? (
          <EmptyState
            icon={CalendarCheck}
            title="No upcoming jobs"
            action={
              <Link href={routes.findBusinesses} className={buttonStyles()}>
                <Search className="size-4" aria-hidden="true" />
                Find a pro
              </Link>
            }
          >
            Book a visit and it shows up here. Bookings made with this email before you signed in are here too.
          </EmptyState>
        ) : (
          <EmptyState icon={History} title="No past jobs yet">
            Finished and cancelled jobs show up here.
          </EmptyState>
        )
      ) : (
        <ul className="space-y-3">
          {shown.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your jobs">
      <div className="h-48 animate-pulse rounded-[1.5rem] bg-paper-deep" />
      <div className="h-11 w-56 animate-pulse rounded-lg bg-paper-deep" />
      <div className="h-28 animate-pulse rounded-[1.25rem] bg-paper-deep" />
      <div className="h-28 animate-pulse rounded-[1.25rem] bg-paper-deep" />
    </div>
  );
}
