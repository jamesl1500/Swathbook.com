"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { routes } from "@/libs/routes";
import { updatePassword, type AuthFormState } from "../actions";
import { PasswordInput } from "../_components/password-input";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(updatePassword, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <FormMessage>
          {state.error}{" "}
          <Link href={routes.forgotPassword} className="font-semibold underline underline-offset-2">
            Get a new link
          </Link>
        </FormMessage>
      ) : null}

      <Field label="New password" htmlFor="password" hint="At least 8 characters." error={errors.password?.[0]}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(errors.password) || undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.[0]}>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.confirmPassword) || undefined}
          aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
        />
      </Field>

      <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
