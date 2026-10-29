"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendVerification, type AuthFormState } from "../actions";

export function ResendVerificationForm() {
  const emailFromLink = useSearchParams().get("email") ?? "";
  const [state, formAction] = useActionState<AuthFormState, FormData>(resendVerification, {});
  const emailError = state.fieldErrors?.email?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <FormMessage tone="success">{state.success}</FormMessage>

      {emailFromLink ? (
        <input type="hidden" name="email" value={emailFromLink} />
      ) : (
        <Field label="Email" htmlFor="email" error={emailError}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values?.email}
            aria-invalid={Boolean(emailError) || undefined}
            aria-describedby={emailError ? "email-error" : undefined}
          />
        </Field>
      )}

      <SubmitButton variant="secondary" size="lg" className="w-full" pendingLabel="Sending…">
        Resend confirmation email
      </SubmitButton>
    </form>
  );
}
