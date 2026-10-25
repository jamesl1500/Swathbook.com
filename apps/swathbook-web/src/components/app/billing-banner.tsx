import Link from "next/link";
import { CircleAlert, PauseCircle, Sparkles } from "lucide-react";
import { getActiveBusiness, getCurrentUser } from "@/libs/auth";
import { loadBilling } from "@/libs/billing/load";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { cn } from "@/libs/utils";

/**
 * A strip above every dashboard page when billing needs attention: the trial
 * is almost over, a payment failed, or the booking page is paused. Owners and
 * admins only; crews never see billing.
 */
export async function BillingBanner() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { active } = await getActiveBusiness(user.id);
  if (!active || active.role === "crew") return null;

  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("id, trial_ends_at").eq("id", active.id).single();
  if (!business) return null;
  const { state } = await loadBilling(supabase, business);

  let tone: "info" | "warn" | "stop";
  let message: string;
  if (state.kind === "trial" && state.daysLeft <= 3) {
    tone = "info";
    message = `Your free trial ends in ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"}. Pick a plan to keep taking bookings.`;
  } else if (state.kind === "past_due") {
    tone = "warn";
    message = "Your last payment didn't go through. Update your card to keep your booking page live.";
  } else if (state.kind === "lapsed") {
    tone = "stop";
    message = "Your booking page is paused. Customers can't book until you pick a plan.";
  } else {
    return null;
  }
  const Icon = tone === "info" ? Sparkles : tone === "warn" ? CircleAlert : PauseCircle;

  return (
    <div
      role="status"
      data-testid="billing-banner"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 text-sm sm:px-6 lg:px-10",
        tone === "info" && "border-brand-200 bg-brand-50 text-ink",
        tone === "warn" && "border-sun bg-sun-soft text-ink",
        tone === "stop" && "border-clay/40 bg-clay-soft text-clay-ink",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      <Link href={routes.billing} className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 font-semibold text-paper hover:bg-brand-700">
        {tone === "warn" ? "Update billing" : "Choose a plan"}
      </Link>
    </div>
  );
}
