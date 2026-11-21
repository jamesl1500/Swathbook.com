import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, Clock, HandCoins, Link2, Mail, Route, Wallet } from "lucide-react";
import { siteConfig } from "@/libs/globals/site";
import { trades } from "@/libs/marketing/content";
import { routes } from "@/libs/routes";
import { cn } from "@/libs/utils";

/*
 * Right-hand visuals for the inner pages' heroes, so the top of each page is
 * balanced on wide screens. Decorative, but readable and accurate to the product.
 */

const card = "rounded-[1.75rem] border border-line bg-card p-6 shadow-lift";

/** Features: the four tools, connected in order. */
export function FourToolsAside() {
  const steps = [
    { icon: Link2, title: "Booking link", body: "Services, prices and open times" },
    { icon: HandCoins, title: "Deposits", body: "Collected the moment they book" },
    { icon: Wallet, title: "Payments", body: "Card or wallet, right after the job" },
    { icon: Route, title: "AI routing", body: "Tomorrow's stops in the best order" },
  ];
  return (
    <div className={cn(card, "rotate-1")}>
      <p className="label-tag text-ink-faint">Four tools, one link</p>
      <ol className="relative mt-4 space-y-3">
        <span className="absolute bottom-6 left-5 top-6 border-l-2 border-dashed border-line-strong" aria-hidden="true" />
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="relative flex items-center gap-4 rounded-2xl bg-paper px-3 py-3">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", index === 3 ? "bg-sun text-ink" : "bg-brand-600 text-paper")}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="text-sm text-ink-soft">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Who it's for: a mosaic of trades. */
export function TradeMosaicAside() {
  const shown = trades.filter((trade) => trade.id !== "other").slice(0, 9);
  return (
    <ul className="grid grid-cols-3 gap-3" aria-label="Some of the trades Swathbook works for">
      {shown.map((trade, index) => {
        const Icon = trade.icon;
        const accent = index === 4;
        return (
          <li
            key={trade.id}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-2 rounded-[1.25rem] border p-3 text-center shadow-card",
              accent ? "border-transparent bg-sun text-ink" : index % 2 ? "border-line bg-card text-ink" : "border-transparent bg-brand-600 text-paper",
            )}
          >
            <Icon className="size-7" aria-hidden="true" />
            <span className="text-sm font-semibold leading-tight">{trade.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Pricing: what every plan includes. */
export function PlanIncludesAside() {
  const included = ["Your own booking link", "Deposits and card payments", "AI route planning", "Email confirmations & reminders", "Customer records"];
  return (
    <div className={cn(card, "-rotate-1")}>
      <p className="label-tag text-ink-faint">Every plan includes</p>
      <ul className="mt-4 space-y-2.5">
        {included.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50">
              <Check className="size-3.5 text-brand-600" aria-hidden="true" />
            </span>
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
        <span className="text-sm">
          <span className="block font-semibold">Start free</span>
          <span className="text-ink-soft">No credit card needed</span>
        </span>
        <Link
          href={routes.signup}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-paper hover:bg-brand-700"
        >
          Get your link
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** Contact: what writing in looks like. */
export function ReplyAside() {
  return (
    <div className={cn(card, "rotate-1 space-y-4")}>
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-paper">
        Can customers book two services in one visit? I do interiors and ceramic coating.
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-paper px-4 py-3">
        Yes. They can pick both, and the time slot covers the full length. Want help setting up your menu?
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-soft">
          <Clock className="size-4 text-brand-600" aria-hidden="true" />
          Usually within one business day
        </span>
        <a href={`mailto:${siteConfig.supportEmail}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
          <Mail className="size-4" aria-hidden="true" />
          Email us
        </a>
      </div>
    </div>
  );
}

/** About: the day the product is built around. */
export function DayAside() {
  const jobs = [
    { time: "8:30", name: "Full interior detail", trade: "Detailing" },
    { time: "11:00", name: "Deep clean", trade: "Cleaning" },
    { time: "1:30", name: "Weekly mow, edge & blow", trade: "Lawn care" },
  ];
  return (
    <div className={cn(card, "-rotate-1")}>
      <div className="flex items-center justify-between">
        <p className="label-tag text-ink-faint">A day on the road</p>
        <CalendarCheck className="size-5 text-brand-600" aria-hidden="true" />
      </div>
      <ul className="mt-4 space-y-2">
        {jobs.map((job) => (
          <li key={job.time} className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3">
            <span className="w-12 shrink-0 font-mono text-sm font-semibold text-brand-600">{job.time}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{job.name}</span>
            <span className="shrink-0 rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{job.trade}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-soft">Booked, paid and routed from one link. The time between jobs is the part we work on.</p>
    </div>
  );
}
