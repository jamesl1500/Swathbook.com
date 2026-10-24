import { CalendarCheck, Lock, MapPin } from "lucide-react";
import { siteConfig } from "@/libs/globals/site";
import { cn, formatDuration, formatPrice } from "@/libs/utils";

export type BookingCardService = {
  name: string;
  price: number;
  durationMinutes: number;
  depositPercent: number;
};

const SAMPLE_TIMES = ["Tue 8:30", "Tue 11:00", "Wed 9:15"];

function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase());
  return letters.join("") || "SB";
}

/**
 * A preview of a business's public booking page. Purely presentational, so it
 * renders in Server Components (marketing) and Client Components (onboarding).
 */
export function BookingCard({
  businessName,
  tagline,
  slug,
  services,
  selectedIndex = 0,
  className,
}: {
  businessName: string;
  tagline?: string;
  slug: string;
  services: BookingCardService[];
  selectedIndex?: number;
  className?: string;
}) {
  const visible = services.filter((service) => service.name.trim()).slice(0, 4);
  const selected = visible[Math.min(selectedIndex, visible.length - 1)];
  const deposit = selected ? Math.round((selected.price * selected.depositPercent) / 100) : 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.75rem] border border-line bg-card shadow-lift",
        className,
      )}
    >
      {/* Browser-ish address bar */}
      <div className="flex items-center gap-2 border-b border-line bg-paper-deep/70 px-4 py-2.5">
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-card px-3 py-1 font-mono text-[0.7rem] text-ink-soft">
          <Lock className="size-3 shrink-0 text-brand-500" aria-hidden="true" />
          <span className="truncate">
            {siteConfig.bookingHost}/<span className="font-semibold text-ink">{slug || "your-business"}</span>
          </span>
        </span>
      </div>

      <div className="map-grid-light px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600 font-display text-lg font-bold text-paper">
            {initials(businessName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold leading-tight">
              {businessName || "Your business"}
            </p>
            <p className="flex items-center gap-1 truncate text-sm text-ink-soft">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {tagline || "Book online in under a minute"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 px-5 py-4">
        <p className="label-tag text-ink-faint">Pick a service</p>
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-sm text-ink-faint">
            Your services will show up here
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((service, index) => {
              const active = service === selected;
              return (
                <li
                  key={`${service.name}-${index}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm",
                    active ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{service.name}</span>
                    <span className="text-xs text-ink-faint">{formatDuration(service.durationMinutes || 0)}</span>
                  </span>
                  <span className="shrink-0 font-display font-bold">
                    {service.price > 0 ? formatPrice(service.price || 0) : "Free"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="label-tag pt-2 text-ink-faint">Next openings</p>
        <div className="flex gap-2">
          {SAMPLE_TIMES.map((time, index) => (
            <span
              key={time}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                index === 0 ? "border-ink bg-ink text-paper" : "border-line text-ink-soft",
              )}
            >
              {time}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-line px-5 py-4">
        <span className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-sm font-semibold text-paper">
          <CalendarCheck className="size-4" aria-hidden="true" />
          {deposit > 0 ? `Book & pay ${formatPrice(deposit)} deposit` : "Book this time"}
        </span>
      </div>
    </div>
  );
}
