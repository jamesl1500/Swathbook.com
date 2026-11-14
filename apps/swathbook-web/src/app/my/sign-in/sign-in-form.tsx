"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { customerSignIn, type CustomerSignInState } from "../actions";

const initial: CustomerSignInState = { step: "email", email: "" };

const secondaryButton =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink disabled:opacity-60";

/**
 * Sign in or create an account in one flow: enter your email, then the code
 * we send. The same email you book with shows every booking made with it.
 */
export function CustomerSignInForm() {
  const next = useSearchParams().get("next");
  const [state, action, pending] = useActionState(customerSignIn, initial);
  const emailError = state.fieldErrors?.email?.[0];
  const codeError = state.fieldErrors?.code?.[0];

  if (state.step === "code") {
    return (
      <>
        <div className="mb-8">
          <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Mail className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Check your email</h1>
          <p className="mt-2.5 leading-relaxed text-ink-soft">
            We sent a sign-in code to <strong className="font-semibold text-ink">{state.email}</strong>. It expires in an hour.
          </p>
        </div>
        <form action={action} className="space-y-5" noValidate>
          <input type="hidden" name="email" value={state.email} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
          {state.error ? <FormMessage>{state.error}</FormMessage> : null}
          <Field label="Sign-in code" htmlFor="code" error={codeError}>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 -]*"
              maxLength={14}
              placeholder="12345678"
              required
              autoFocus
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "code-error" : undefined}
              className="font-mono text-lg tracking-[0.2em]"
            />
          </Field>
          {/* First submit button, so Enter signs in. */}
          <SubmitButton name="intent" value="verify" size="lg" className="w-full" pendingLabel="Signing in…">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Sign in
          </SubmitButton>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="submit" name="intent" value="change" formNoValidate className={secondaryButton} disabled={pending}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Different email
            </button>
            <button type="submit" name="intent" value="resend" formNoValidate className={secondaryButton} disabled={pending}>
              Send a new code
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Your bookings</h1>
        <p className="mt-2.5 leading-relaxed text-ink-soft">
          Sign in with the email you book with. We&apos;ll email you a code; no password needed. New here? This creates your account.
        </p>
      </div>
      <form action={action} className="space-y-5" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        <Field label="Email" htmlFor="email" error={emailError}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            defaultValue={state.email}
            placeholder="you@example.com"
            required
            autoFocus
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "email-error" : undefined}
          />
        </Field>
        <SubmitButton name="intent" value="send" size="lg" className="w-full" pendingLabel="Sending…">
          Email me a code
        </SubmitButton>
      </form>
    </>
  );
}
