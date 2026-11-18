import Link from "next/link";
import { CloudRain } from "lucide-react";
import { loadRainOutlook, nextRainDay, type RainBusiness } from "@/libs/rain";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { formatDateShort } from "@/libs/time";

/**
 * "Rain likely Tuesday: 6 outdoor jobs." on the dashboard and schedule, for
 * owners and admins, when one of the next three days looks wet and has jobs
 * rain would stop. Renders nothing otherwise (or without a forecast).
 */
export async function RainBanner({ business }: { business: RainBusiness }) {
  if (!business.rain_alerts_enabled) return null;
  const outlook = await loadRainOutlook(await createClient(), business, 3, { onlyIfRainy: true });
  const day = nextRainDay(outlook, 3);
  if (!day?.forecast) return null;

  return (
    <Link
      href={`${routes.rainDays}?day=${day.date}`}
      className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-3 text-sm text-brand-700 hover:border-brand-400"
      data-testid="rain-banner"
    >
      <CloudRain className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>
          Rain likely {formatDateShort(day.date)} ({day.forecast.rainChance}%).
        </strong>{" "}
        {day.atRisk} outdoor {day.atRisk === 1 ? "job" : "jobs"} could be rained out.
      </span>
      <span className="shrink-0 font-semibold underline-offset-2 hover:underline">Plan a rain day</span>
    </Link>
  );
}
