"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Link2 } from "lucide-react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { siteConfig } from "@/libs/globals/site";
import { slugify } from "@/libs/utils";
import { signUp, type AuthFormState } from "../actions";
import { PasswordInput } from "../_components/password-input";

export function SignupForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signUp, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Suspense>
        <ClaimedSlug fallback={state.values?.slug} />
      </Suspense>

      <FormMessage>{state.error}</FormMessage>

      <Field label="Your name" htmlFor="fullName" error={errors.fullName?.[0]}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName}
          aria-invalid={Boolean(errors.fullName) || undefined}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 8 characters." error={errors.password?.[0]}>
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

      <SubmitButton size="lg" className="w-full" pendingLabel="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  );
}

/**
 * Carries the slug from the landing page's "Claim it" form through signup.
 */
function ClaimedSlug({ fallback }: { fallback?: string }) {
  const slug = slugify(useSearchParams().get("slug") ?? fallback ?? "");
  if (!slug) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
      <Link2 className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
      <span className="min-w-0">
        Saving <strong className="font-mono">{siteConfig.bookingHost}/{slug}</strong> for you
      </span>
      <input type="hidden" name="slug" value={slug} />
    </div>
  );
}
