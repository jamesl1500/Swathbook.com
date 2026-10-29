"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { routes } from "@/libs/routes";
import { signIn, type AuthFormState } from "../actions";
import { PasswordInput } from "../_components/password-input";
import { HiddenParamInput } from "../_components/search-params";

export function LoginForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signIn, {});
  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage>{state.error}</FormMessage>

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

      <Field
        label="Password"
        htmlFor="password"
        error={passwordError}
        action={
          <Link href={routes.forgotPassword} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        }
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(passwordError) || undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
        />
      </Field>

      <Suspense>
        <HiddenParamInput name="next" />
      </Suspense>

      <SubmitButton size="lg" className="w-full" pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
