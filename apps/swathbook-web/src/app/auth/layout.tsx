import type { Metadata } from "next";
import type { ReactNode } from "react";
import { noIndex } from "@/libs/seo";
import Link from "next/link";
import { CalendarCheck, HandCoins, Route } from "lucide-react";
import { BrandPin, Logo } from "@/components/brand/logo";
import { routes } from "@/libs/routes";

const perks = [
  { icon: CalendarCheck, text: "Customers book open times from your link" },
  { icon: HandCoins, text: "Deposits collected at booking" },
  { icon: Route, text: "An AI-planned route every morning" },
];

const todaysJobs = [
  { time: "8:30 AM", name: "Full interior detail", trade: "Detailing", paid: true },
  { time: "11:00 AM", name: "Deep clean", trade: "Cleaning", paid: true },
  { time: "1:30 PM", name: "Service call & diagnosis", trade: "Plumbing", paid: false },
];

export const metadata: Metadata = { robots: noIndex };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,0.85fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <p className="text-center text-xs text-ink-faint">
          By continuing you agree to our{" "}
          <Link href={routes.terms} className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href={routes.privacy} className="underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <aside className="map-grid relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:p-14">
        <BrandPin className="absolute right-14 top-14 h-32 w-24 drop-shadow-xl" />

        {/* A glimpse of the product: the day, booked, paid and in route order. */}
        <div className="relative mt-24 w-full max-w-sm -rotate-1 rounded-[1.5rem] bg-card p-5 text-ink shadow-lift" aria-hidden="true">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-bold">Today</p>
            <span className="rounded-full bg-sun-soft px-2.5 py-1 text-xs font-semibold">3 stops · AI-planned</span>
          </div>
          <ol className="mt-4 space-y-2">
            {todaysJobs.map((job, index) => (
              <li key={job.time} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-paper">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{job.name}</span>
                  <span className="text-xs text-ink-soft">
                    {job.time} · {job.trade}
                  </span>
                </span>
                {job.paid ? <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Deposit paid</span> : null}
              </li>
            ))}
          </ol>
        </div>

        <div className="relative max-w-md text-paper">
          <p className="label-tag text-sky">Swathbook</p>
          <p className="mt-4 font-display text-4xl font-bold leading-tight">
            Book the job. Get paid. Drive less.
          </p>
          <ul className="mt-8 space-y-4">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-paper/90">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper/10">
                  <Icon className="size-4 text-sky" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
