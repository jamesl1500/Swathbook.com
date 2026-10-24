"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/app/auth/_components/password-input";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { DELETE_CONFIRMATION } from "@/libs/validation/auth";
import { changeEmail, changePassword, deleteAccount, updateName } from "./actions";

function withToast(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  return async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) toast.success(result.success);
    return result;
  };
}

function FormError({ state }: { state: FormState }) {
  return state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null;
}

/** Password managers fill the right account when the form names it. */
function UsernameHint({ email }: { email: string }) {
  return <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />;
}

export function NameForm({ fullName }: { fullName: string }) {
  const [state, formAction] = useActionState(withToast(updateName), {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError state={state} />
      <Field label="Full name" htmlFor="fullName" hint="Shown to your team and on jobs assigned to you." error={state.fieldErrors?.fullName?.[0]}>
        <Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" required maxLength={80} />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
    </form>
  );
}

export function EmailForm({ email, pendingEmail }: { email: string; pendingEmail: string | null }) {
  // No toast here: the success message has instructions, so it stays on screen.
  const [state, formAction] = useActionState(changeEmail, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <p className="text-sm text-ink-soft">
        You log in with <strong className="text-ink" data-testid="current-email">{email}</strong>.
      </p>
      {pendingEmail && !state.success ? (
        <FormMessage tone="info">
          Waiting for you to confirm <strong>{pendingEmail}</strong>. Check that inbox for the link.
        </FormMessage>
      ) : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : <FormError state={state} />}
      <UsernameHint email={email} />
      <Field label="New email" htmlFor="email" error={errors.email?.[0]}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Current password" htmlFor="email-currentPassword" error={errors.currentPassword?.[0]}>
        <PasswordInput id="email-currentPassword" name="currentPassword" autoComplete="current-password" required />
      </Field>
      <SubmitButton pendingLabel="Sending link…">Change email</SubmitButton>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(withToast(changePassword), {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError state={state} />
      <UsernameHint email={email} />
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.[0]}>
        <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="password" hint="At least 8 characters." error={errors.password?.[0]}>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.[0]}>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm({ email, owned, memberOf }: { email: string; owned: string[]; memberOf: string[] }) {
  const [state, formAction] = useActionState(deleteAccount, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2 text-sm text-ink-soft">
        <p>This permanently deletes your login and can&apos;t be undone.</p>
        {owned.length ? (
          <p>
            It also deletes {owned.length === 1 ? "the business you own" : `the ${owned.length} businesses you own`}, with all of
            their customers, jobs, routes and payment records: <strong className="text-ink">{owned.join(", ")}</strong>. Their booking
            links stop working. Your Stripe account and its payout history stay with Stripe.
          </p>
        ) : null}
        {memberOf.length ? (
          <p>
            You&apos;ll be removed from <strong className="text-ink">{memberOf.join(", ")}</strong>. Those businesses keep their data.
          </p>
        ) : null}
      </div>
      <FormError state={state} />
      <UsernameHint email={email} />
      <Field label={<>Type &ldquo;{DELETE_CONFIRMATION}&rdquo; to confirm</>} htmlFor="confirmation" error={errors.confirmation?.[0]}>
        <Input id="confirmation" name="confirmation" autoComplete="off" spellCheck={false} required />
      </Field>
      <Field label="Current password" htmlFor="delete-currentPassword" error={errors.currentPassword?.[0]}>
        <PasswordInput id="delete-currentPassword" name="currentPassword" autoComplete="current-password" required />
      </Field>
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete my account
      </SubmitButton>
    </form>
  );
}
