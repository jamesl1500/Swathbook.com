"use client";

import { useTransition } from "react";
import { ExternalLink, Landmark, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/libs/forms";
import { openExpressDashboard, refreshPayoutStatus, startPayoutsOnboarding } from "./actions";

const modes = {
  start: { label: "Set up payouts", icon: Landmark, action: startPayoutsOnboarding, variant: "primary" },
  continue: { label: "Continue setup on Stripe", icon: Landmark, action: startPayoutsOnboarding, variant: "accent" },
  dashboard: { label: "Open Stripe dashboard", icon: ExternalLink, action: openExpressDashboard, variant: "secondary" },
  refresh: { label: "Refresh", icon: RefreshCw, action: refreshPayoutStatus, variant: "ghost" },
} as const;

export function PayoutActions({ businessId, mode }: { businessId: string; mode: keyof typeof modes }) {
  const [pending, startTransition] = useTransition();
  const { label, icon: Icon, action, variant } = modes[mode];

  return (
    <Button
      variant={variant}
      size={mode === "refresh" ? "sm" : "md"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const formData = new FormData();
          formData.set("businessId", businessId);
          // Successful onboarding/dashboard calls redirect to Stripe and never return.
          const result: FormState = await action(formData);
          if (result?.error) toast.error(result.error);
          else if (result?.success) toast.success(result.success);
        })
      }
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
      {label}
    </Button>
  );
}
