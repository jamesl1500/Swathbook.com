"use client";

import { useActionState } from "react";
import { ExternalLink } from "lucide-react";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PaidPlan } from "@/libs/billing/plans";
import type { FormState } from "@/libs/forms";
import { openBillingPortal, startCheckout } from "./actions";

export function ChoosePlanButton({ businessId, plan, label, highlighted }: { businessId: string; plan: PaidPlan; label: string; highlighted?: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(startCheckout, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton variant={highlighted ? "accent" : "secondary"} className="min-h-11 w-full" pendingLabel="Opening checkout…">
        {label}
      </SubmitButton>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}

export function ManageBillingButton({ businessId, label = "Manage billing" }: { businessId: string; label?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(openBillingPortal, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <SubmitButton variant="secondary" className="min-h-11" pendingLabel="Opening…">
        <ExternalLink className="size-4" aria-hidden="true" />
        {label}
      </SubmitButton>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
