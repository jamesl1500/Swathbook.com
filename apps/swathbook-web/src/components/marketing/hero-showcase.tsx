"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { BookingCard } from "@/components/booking/booking-card";
import { findTrade } from "@/libs/marketing/content";
import { cn } from "@/libs/utils";

/** One sample business per trade, so the hero never reads as "for one kind of work". */
const examples = [
  { trade: "mobile-detailing", label: "Detailing", businessName: "Shine On Mobile Detailing", tagline: "We come to your driveway", slug: "shine-on", selected: 1 },
  { trade: "house-cleaning", label: "Cleaning", businessName: "Bright Nest Cleaning", tagline: "Homes & move-outs, Eastside", slug: "bright-nest", selected: 0 },
  { trade: "lawn-care", label: "Lawn care", businessName: "Northside Lawn Co.", tagline: "Weekly cuts, Northside & Maple Hills", slug: "northside-lawn", selected: 0 },
  { trade: "plumbing", label: "Plumbing", businessName: "Fix-It Fast Plumbing", tagline: "Licensed & insured", slug: "fix-it-fast", selected: 0 },
].map((example) => {
  const services = findTrade(example.trade)!.sampleServices;
  const service = services[example.selected];
  return { ...example, services, deposit: Math.round((service.price * service.depositPercent) / 100) };
});

const ROTATE_MS = 4500;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % examples.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  const example = examples[index];

  return (
    <div
      className="relative mx-auto w-full max-w-md"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div role="tablist" aria-label="Example businesses" className="mb-4 flex flex-wrap justify-center gap-2">
        {examples.map((item, itemIndex) => (
          <button
            key={item.trade}
            type="button"
            role="tab"
            aria-selected={itemIndex === index}
            aria-controls="hero-example"
            onClick={() => setIndex(itemIndex)}
            className={cn(
              "min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors",
              itemIndex === index ? "border-brand-600 bg-brand-600 text-paper" : "border-line bg-card text-ink-soft hover:border-ink-faint hover:text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="hero-example" role="tabpanel" aria-label={`${example.label} example`} className="relative">
        <BookingCard
          key={example.trade}
          businessName={example.businessName}
          tagline={example.tagline}
          slug={example.slug}
          services={example.services}
          selectedIndex={example.selected}
          className="animate-rise"
        />
        {example.deposit > 0 ? (
          // Below the card, not over it, so it never covers the booking button.
          <div
            key={`${example.trade}-deposit`}
            className="relative -mt-3 ml-auto mr-3 flex w-fit animate-rise items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm shadow-lift"
            style={{ animationDelay: "300ms" }}
          >
            <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-paper">
              <BadgeCheck className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-semibold">Deposit received</span>
              <span className="text-ink-faint">${example.deposit} · Sat 9:00 AM</span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
