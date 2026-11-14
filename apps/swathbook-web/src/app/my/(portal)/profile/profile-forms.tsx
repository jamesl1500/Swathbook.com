"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CustomerDetails } from "@/libs/customer";
import type { FormState } from "@/libs/forms";
import { deleteCustomerAccount, saveCustomerDetails } from "../../actions";

function TextField({
  name,
  label,
  state,
  defaultValue,
  hint,
  ...props
}: {
  name: string;
  label: string;
  state: FormState;
  defaultValue: string;
  hint?: string;
} & Omit<React.ComponentProps<"input">, "name" | "defaultValue">) {
  const error = state.fieldErrors?.[name]?.[0];
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...props}
      />
    </Field>
  );
}

export function DetailsForm({ details }: { details: CustomerDetails }) {
  const [state, action] = useActionState(saveCustomerDetails, {});
  const home = details.home_address;
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="fullName" label="Name" state={state} defaultValue={details.full_name ?? ""} autoComplete="name" required maxLength={120} />
        <TextField name="phone" label="Phone" state={state} defaultValue={details.phone ?? ""} type="tel" autoComplete="tel" maxLength={20} />
      </div>
      <fieldset className="space-y-5">
        <legend className="mb-1 font-bold">Home address</legend>
        <p className="-mt-3 text-sm text-ink-soft">Fills in new bookings for you. Leave the street blank to remove it.</p>
        <TextField name="line1" label="Street address" state={state} defaultValue={home?.line1 ?? ""} autoComplete="address-line1" maxLength={200} />
        <TextField name="line2" label="Apartment, suite (optional)" state={state} defaultValue={home?.line2 ?? ""} autoComplete="address-line2" maxLength={200} />
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField name="city" label="City" state={state} defaultValue={home?.city ?? ""} autoComplete="address-level2" maxLength={100} />
          <TextField name="region" label="State" state={state} defaultValue={home?.region ?? ""} autoComplete="address-level1" maxLength={100} />
          <TextField name="postalCode" label="ZIP code" state={state} defaultValue={home?.postal_code ?? ""} autoComplete="postal-code" maxLength={20} />
        </div>
      </fieldset>
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteCustomerAccount, {});
  const error = state.fieldErrors?.confirm?.[0];
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && !error ? <FormMessage>{state.error}</FormMessage> : null}
      <Field label="Type DELETE to confirm" htmlFor="confirm" error={error}>
        <Input
          id="confirm"
          name="confirm"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="max-w-xs"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "confirm-error" : undefined}
        />
      </Field>
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete my account
      </SubmitButton>
    </form>
  );
}
