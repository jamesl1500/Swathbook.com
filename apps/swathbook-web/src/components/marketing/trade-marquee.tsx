import { trades } from "@/libs/marketing/content";

/**
 * Endless strip of trade names. The list is rendered twice so the -50% loop is seamless.
 */
export function TradeMarquee() {
  const list = trades.filter((trade) => trade.id !== "other");

  return (
    <div data-allow-overflow className="relative overflow-hidden border-y border-line bg-card py-5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
        {[...list, ...list].map((trade, index) => {
          const Icon = trade.icon;
          return (
            <span
              key={`${trade.id}-${index}`}
              aria-hidden={index >= list.length}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink-soft"
            >
              <Icon className="size-4 text-brand-500" aria-hidden="true" />
              {trade.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
