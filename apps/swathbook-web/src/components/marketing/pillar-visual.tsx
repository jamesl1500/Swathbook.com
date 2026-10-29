import { Copy, Wallet } from "lucide-react";
import { siteConfig } from "@/libs/globals/site";
import { RoutePreview } from "./route-preview";

/** The illustration beside each of the four core features (home and features pages). */
export function PillarVisual({ kicker }: { kicker: string }) {
  if (kicker === "Your link") {
    return (
      <div className="w-full max-w-sm rounded-[1.5rem] border border-line bg-card p-6 shadow-lift">
        <p className="label-tag text-ink-faint">Your booking link</p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3">
          <span className="truncate font-mono text-sm">
            {siteConfig.bookingLinkPrefix}<strong>shine-on</strong>
          </span>
          <Copy className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
        </div>
        <p className="label-tag mt-6 text-ink-faint">Put it everywhere</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Truck or van wrap", "Google profile", "Text replies", "Instagram bio", "Business cards", "Flyers"].map(
            (place) => (
              <span key={place} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft">
                {place}
              </span>
            ),
          )}
        </div>
      </div>
    );
  }

  if (kicker === "Deposits") {
    return (
      <div className="relative w-full max-w-sm rounded-[1.5rem] border border-line bg-card p-6 shadow-lift">
        <span className="absolute -right-3 -top-4 rotate-6 rounded-xl border-2 border-brand-600 bg-paper px-3 py-1 font-display text-lg font-extrabold uppercase text-brand-600">
          Booked
        </span>
        <p className="label-tag text-ink-faint">New booking</p>
        <p className="mt-2 font-display text-xl font-bold">Full interior detail</p>
        <p className="text-sm text-ink-soft">Sat, Nov 8 · 9:00 AM · 1418 Maple Ct</p>
        <dl className="mt-5 space-y-2 border-t border-dashed border-line-strong pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Job total</dt>
            <dd className="font-semibold">$180.00</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Deposit (25%)</dt>
            <dd className="font-semibold text-brand-600">$45.00 paid</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Cancellation policy</dt>
            <dd className="font-semibold">48 hrs</dd>
          </div>
        </dl>
      </div>
    );
  }

  if (kicker === "Payments") {
    return (
      <div className="w-full max-w-sm rounded-[1.5rem] border border-line bg-card p-6 shadow-lift">
        <div className="flex items-center justify-between">
          <p className="label-tag text-ink-faint">Invoice #1042</p>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">Paid</span>
        </div>
        <p className="mt-4 font-display text-5xl font-extrabold tracking-tight">$135.00</p>
        <p className="text-sm text-ink-soft">Balance after $45 deposit</p>
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-paper px-4 py-3 text-sm">
          <span className="grid size-9 place-items-center rounded-full bg-ink text-paper">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">Paid by card</span>
            <span className="text-ink-faint">2 minutes after the job</span>
          </span>
        </div>
      </div>
    );
  }

  return <RoutePreview className="w-full max-w-sm" />;
}
