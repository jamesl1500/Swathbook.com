import Link from "next/link";
import { ArrowRight, ClipboardList, Clock } from "lucide-react";
import { BookingStatusBadge } from "@/components/app/ui";
import type { CustomerJob } from "@/libs/customer";
import { customerJobPath } from "@/libs/routes";
import { formatDateLong, formatDateShort, formatTime, toDateKey } from "@/libs/time";
import { cn } from "@/libs/utils";

export function jobServices(job: Pick<CustomerJob, "items">) {
  return job.items.map((item) => item.name).join(", ") || "Booking";
}

function datePart(iso: string, timeZone: string, part: "month" | "day") {
  return new Intl.DateTimeFormat("en-US", part === "month" ? { timeZone, month: "short" } : { timeZone, day: "numeric" }).format(new Date(iso));
}

function timeRange(job: CustomerJob) {
  const tz = job.business.timezone;
  return `${formatTime(job.scheduled_start, tz)} – ${formatTime(job.scheduled_end, tz)}`;
}

/** A job in the list: a calendar tile, what and who, when, and its status. */
export function JobCard({ job }: { job: CustomerJob }) {
  const tz = job.business.timezone;
  const muted = ["cancelled", "completed", "no_show"].includes(job.status);
  const day = formatDateShort(toDateKey(new Date(job.scheduled_start), tz));

  return (
    <article className="group relative flex gap-4 rounded-[1.25rem] border border-line bg-card p-4 transition-[border-color,box-shadow] hover:border-ink-faint hover:shadow-card focus-within:ring-3 focus-within:ring-brand-200 sm:p-5">
      <div className={cn("flex w-14 shrink-0 flex-col items-center rounded-xl py-2", muted ? "bg-paper-deep text-ink-soft" : "bg-brand-600 text-paper")} aria-hidden="true">
        <span className={cn("label-tag text-[0.65rem]", muted ? "text-ink-faint" : "text-sky")}>{datePart(job.scheduled_start, tz, "month")}</span>
        <span className="font-display text-2xl font-extrabold leading-7">{datePart(job.scheduled_start, tz, "day")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold">
          <Link href={customerJobPath(job.id)} className="after:absolute after:inset-0 after:rounded-[1.25rem] focus-visible:outline-none">
            {jobServices(job)}
          </Link>
        </h3>
        <p className="truncate text-sm text-ink-soft">{job.business.name}</p>
        <p className="mt-0.5 text-sm text-ink-faint">
          {day} · {timeRange(job)}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <BookingStatusBadge status={job.status} />
          {job.cancel_requested_at ? (
            <span className="inline-flex items-center rounded-full bg-clay-soft px-2.5 py-1 text-xs font-semibold text-clay-ink">Cancel requested</span>
          ) : null}
        </div>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </article>
  );
}

/** The next visit, front and center. */
export function NextJobHero({ job }: { job: CustomerJob }) {
  const tz = job.business.timezone;
  return (
    <section aria-labelledby="next-visit" className="relative overflow-hidden rounded-[1.5rem] bg-ink p-6 text-paper sm:p-8">
      <p id="next-visit" className="label-tag text-sky">
        Next visit
      </p>
      <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">{formatDateLong(toDateKey(new Date(job.scheduled_start), tz))}</h2>
      <p className="mt-2 flex items-center gap-2 text-paper/85">
        <Clock className="size-4 shrink-0 text-sky" aria-hidden="true" />
        {timeRange(job)}
      </p>
      <p className="mt-1 flex items-center gap-2 text-paper/85">
        <ClipboardList className="size-4 shrink-0 text-sky" aria-hidden="true" />
        {jobServices(job)} with {job.business.name}
      </p>
      <Link
        href={customerJobPath(job.id)}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-sun px-5 text-sm font-semibold text-ink transition-colors hover:bg-[#f2621a]"
      >
        View details
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
