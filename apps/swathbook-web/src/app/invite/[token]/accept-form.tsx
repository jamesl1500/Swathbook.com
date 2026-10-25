"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { acceptInvite } from "./actions";

export function AcceptInviteForm({ token, businessName }: { token: string; businessName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(acceptInvite, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <SubmitButton size="lg" className="w-full" pendingLabel="Joining…">
        Join {businessName}
      </SubmitButton>
    </form>
  );
}
