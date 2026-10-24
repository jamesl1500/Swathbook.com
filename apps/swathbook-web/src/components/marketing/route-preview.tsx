import { Clock, House, Navigation, Sparkles } from "lucide-react";
import { cn } from "@/libs/utils";

// Customer and arrival time only, so the card fits any trade.
const STOPS = [
  { x: 92, y: 150, label: "Ramirez · 8:30 AM" },
  { x: 128, y: 92, label: "Okafor · 9:45 AM" },
  { x: 196, y: 70, label: "Chen · 11:15 AM" },
  { x: 254, y: 112, label: "Patel · 1:00 PM" },
  { x: 236, y: 176, label: "Brooks · 2:30 PM" },
];

/**
 * Illustrative "today's route" card: a planned loop through five stops with the
 * old, back-and-forth order ghosted underneath.
 */
export function RoutePreview({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[1.75rem] border border-line bg-card shadow-lift", className)}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div>
          <p className="label-tag text-ink-faint">Today&apos;s route</p>
          <p className="font-display text-lg font-bold">5 stops · 38 mi</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-soft px-3 py-1 text-xs font-semibold text-ink">
          <Sparkles className="size-3.5" aria-hidden="true" />
          AI-planned
        </span>
      </div>

      <svg viewBox="0 0 320 220" className="mt-3 block w-full" role="img" aria-label="Map showing an optimized route through five stops">
        <rect width="320" height="220" fill="var(--color-paper-deep)" />
        {/* City blocks */}
        <g fill="var(--color-paper)">
          {[0, 1, 2, 3, 4].map((col) =>
            [0, 1, 2, 3].map((row) => (
              <rect key={`${col}-${row}`} x={14 + col * 62} y={10 + row * 52} width="50" height="40" rx="6" />
            )),
          )}
        </g>
        {/* Park + creek */}
        <rect x="138" y="114" width="50" height="40" rx="6" fill="var(--color-brand-100)" />
        <path d="M0 196 C 60 184, 90 214, 150 202 S 260 188, 320 204" stroke="#cfe2dc" strokeWidth="10" fill="none" />

        {/* The old, zig-zag order */}
        <path
          d="M40 186 L196 70 L92 150 L254 112 L128 92 L236 176"
          fill="none"
          stroke="var(--color-clay)"
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeDasharray="4 6"
          strokeLinecap="round"
        />

        {/* The planned loop */}
        <path
          d="M40 186 C 60 170, 76 162, 92 150 S 114 104, 128 92 S 172 64, 196 70 S 246 92, 254 112 S 250 166, 236 176"
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Home base */}
        <g transform="translate(40 186)">
          <circle r="13" fill="var(--color-ink)" />
          <foreignObject x="-7" y="-7" width="14" height="14">
            <House className="size-3.5 text-paper" aria-hidden="true" />
          </foreignObject>
        </g>

        {STOPS.map((stop, index) => (
          <g key={stop.label} transform={`translate(${stop.x} ${stop.y})`}>
            <circle r="12" fill="var(--color-card)" stroke="var(--color-brand-600)" strokeWidth="3" />
            <text
              textAnchor="middle"
              dy="4.5"
              fontSize="12"
              fontWeight="700"
              fill="var(--color-brand-700)"
              fontFamily="var(--font-sans)"
            >
              {index + 1}
            </text>
          </g>
        ))}
      </svg>

      <ol className="space-y-1.5 px-5 py-4 text-sm">
        {STOPS.slice(0, 3).map((stop, index) => (
          <li key={stop.label} className="flex items-center gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[0.65rem] font-bold text-paper">
              {index + 1}
            </span>
            <span className="truncate text-ink-soft">{stop.label}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-soft">
          <Clock className="size-4" aria-hidden="true" />
          <span>
            <strong className="text-ink">34 min</strong> less driving
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-600">
          <Navigation className="size-4" aria-hidden="true" />
          Start route
        </span>
      </div>
    </div>
  );
}
