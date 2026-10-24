"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset, type AuthFormState } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});
  const emailError = state.fieldErrors?.email?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <FormMessage tone="success">{state.success}</FormMessage>

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

      <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">
        {state.success ? "Send it again" : "Send reset link"}
      </SubmitButton>
    </form>
  );
}
