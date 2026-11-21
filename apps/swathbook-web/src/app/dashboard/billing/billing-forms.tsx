"use client";

import { useActionState } from "react";
import { ExternalLink } from "lucide-react";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { openBillingPortal } from "./actions";

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
