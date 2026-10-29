"use client";

import { useActionState, useState, useTransition } from "react";
import { MapPin, Pencil, Star, Trash } from "lucide-react";
import { toast } from "sonner";
import { AddressInput, emptyAddress, type AddressValue } from "@/components/booking/address-input";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { createCustomer, deleteAddress, deleteCustomer, makePrimaryAddress, saveAddress, updateCustomer } from "./actions";

type CustomerValues = {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
  tags: string[];
  emailOptIn: boolean;
  smsOptIn: boolean;
};

function toastResult(action: (prev: FormState, formData: FormData) => Promise<FormState>, after?: (result: FormState) => void) {
  return async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) toast.success(result.success);
    after?.(result);
    return result;
  };
}

function CustomerFields({ values, errors }: { values: CustomerValues; errors: FormState["fieldErrors"] }) {
  return (
    <>
      <Field label="Name" htmlFor="fullName" error={errors?.fullName?.[0]}>
        <Input id="fullName" name="fullName" defaultValue={values.fullName} autoComplete="off" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={errors?.email?.[0]}>
          <Input id="email" name="email" type="email" defaultValue={values.email} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors?.phone?.[0]}>
          <Input id="phone" name="phone" type="tel" defaultValue={values.phone} autoComplete="off" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes" hint="Only your team sees these." error={errors?.notes?.[0]}>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={values.notes} className={inputStyles} />
      </Field>
      <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. weekly, corner lot, prefers texts" error={errors?.tags?.[0]}>
        <Input id="tags" name="tags" defaultValue={values.tags.join(", ")} />
      </Field>
      <div className="space-y-2 rounded-xl bg-paper px-3 py-3 text-sm">
        <label className="flex items-center gap-2.5">
          <input type="checkbox" name="emailOptIn" defaultChecked={values.emailOptIn} className="size-4 accent-[var(--color-brand-600)]" />
          Email reminders
        </label>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" name="smsOptIn" defaultChecked={values.smsOptIn} className="size-4 accent-[var(--color-brand-600)]" />
          Text message reminders
        </label>
      </div>
    </>
  );
}

export function NewCustomerForm({ businessId, googleEnabled }: { businessId: string; googleEnabled: boolean }) {
  const [state, formAction] = useActionState(createCustomer, {});
  const [address, setAddress] = useState<AddressValue>(emptyAddress);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <CustomerFields
        values={{ fullName: "", email: "", phone: "", notes: "", tags: [], emailOptIn: true, smsOptIn: false }}
        errors={state.fieldErrors}
      />
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">
          Service address <span className="font-normal text-ink-faint">(optional)</span>
        </legend>
        <AddressInput value={address} onChange={setAddress} googleEnabled={googleEnabled} required={false} errors={{ line1: state.fieldErrors?.line1?.[0] }} />
      </fieldset>
      <SubmitButton pendingLabel="Saving…">Add customer</SubmitButton>
    </form>
  );
}

export function EditCustomerForm({ businessId, values, onDone }: { businessId: string; values: CustomerValues; onDone: () => void }) {
  const [state, formAction] = useActionState(toastResult(updateCustomer, (result) => result.success && onDone()), {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="customerId" value={values.id} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}
      <CustomerFields values={values} errors={state.fieldErrors} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CustomerProfile({
  businessId,
  values,
  canManage,
}: {
  businessId: string;
  values: CustomerValues;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  if (editing) return <EditCustomerForm businessId={businessId} values={values} onDone={() => setEditing(false)} />;

  return (
    <div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="label-tag text-ink-faint">Email</dt>
          <dd className="mt-0.5">{values.email ? <a className="font-semibold text-brand-600" href={`mailto:${values.email}`}>{values.email}</a> : "—"}</dd>
        </div>
        <div>
          <dt className="label-tag text-ink-faint">Phone</dt>
          <dd className="mt-0.5">{values.phone ? <a className="font-semibold text-brand-600" href={`tel:${values.phone}`}>{values.phone}</a> : "—"}</dd>
        </div>
        {values.tags.length ? (
          <div>
            <dt className="label-tag text-ink-faint">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {values.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-semibold">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {values.notes ? (
          <div>
            <dt className="label-tag text-ink-faint">Notes</dt>
            <dd className="mt-0.5 whitespace-pre-line">{values.notes}</dd>
          </div>
        ) : null}
      </dl>
      {canManage ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Delete ${values.fullName}? This can't be undone.`)) return;
              startTransition(async () => {
                const formData = new FormData();
                formData.set("businessId", businessId);
                formData.set("customerId", values.id!);
                const result = await deleteCustomer(formData);
                if (result?.error) toast.error(result.error);
              });
            }}
          >
            <Trash className="size-4" aria-hidden="true" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export type AddressRow = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  access_notes: string | null;
  is_primary: boolean;
};

function AddressForm({
  businessId,
  customerId,
  googleEnabled,
  address,
  onDone,
}: {
  businessId: string;
  customerId: string;
  googleEnabled: boolean;
  address?: AddressRow;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(toastResult(saveAddress, (result) => result.success && onDone()), {});
  const [value, setValue] = useState<AddressValue>(
    address
      ? {
          line1: address.line1,
          line2: address.line2 ?? "",
          city: address.city ?? "",
          region: address.region ?? "",
          postalCode: address.postal_code ?? "",
          placeId: address.google_place_id ?? "",
          lat: address.lat,
          lng: address.lng,
        }
      : emptyAddress,
  );
  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-line bg-paper p-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="customerId" value={customerId} />
      {address ? <input type="hidden" name="addressId" value={address.id} /> : null}
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}
      <Field label={<>Label <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor={`label-${address?.id ?? "new"}`}>
        <Input id={`label-${address?.id ?? "new"}`} name="label" defaultValue={address?.label ?? ""} placeholder="Home, rental, office" />
      </Field>
      <AddressInput value={value} onChange={setValue} googleEnabled={googleEnabled} errors={{ line1: state.fieldErrors?.line1?.[0] }} />
      <Field label="Access notes" htmlFor={`access-${address?.id ?? "new"}`} hint="Gate codes, pets, where to park. The crew sees this.">
        <textarea id={`access-${address?.id ?? "new"}`} name="accessNotes" rows={2} maxLength={500} defaultValue={address?.access_notes ?? ""} className={inputStyles} />
      </Field>
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save address
        </SubmitButton>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AddressList({
  businessId,
  customerId,
  addresses,
  googleEnabled,
  canManage,
}: {
  businessId: string;
  customerId: string;
  addresses: AddressRow[];
  googleEnabled: boolean;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (formData: FormData) => Promise<FormState>, addressId: string) {
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("customerId", customerId);
    formData.set("addressId", addressId);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return (
    <div className="space-y-3">
      {addresses.map((address) =>
        editing === address.id ? (
          <AddressForm key={address.id} businessId={businessId} customerId={customerId} googleEnabled={googleEnabled} address={address} onDone={() => setEditing(null)} />
        ) : (
          <div key={address.id} className="flex gap-3 rounded-xl border border-line p-4">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {address.label ?? "Address"}
                {address.is_primary ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">Primary</span> : null}
                {address.lat == null ? <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs">Not on the map yet</span> : null}
              </p>
              <p className="mt-0.5 text-ink-soft">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                {address.city ? `, ${address.city}` : ""} {address.region ?? ""} {address.postal_code ?? ""}
              </p>
              {address.access_notes ? <p className="mt-1 text-ink-faint">{address.access_notes}</p> : null}
            </div>
            {canManage ? (
              <div className="flex shrink-0 items-start gap-1">
                {!address.is_primary ? (
                  <button type="button" disabled={pending} onClick={() => run(makePrimaryAddress, address.id)} title="Make primary" aria-label="Make primary" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-paper-deep hover:text-ink">
                    <Star className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" onClick={() => setEditing(address.id)} title="Edit address" aria-label="Edit address" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-paper-deep hover:text-ink">
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => window.confirm("Remove this address?") && run(deleteAddress, address.id)}
                  title="Remove address"
                  aria-label="Remove address"
                  className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-clay-soft hover:text-clay"
                >
                  <Trash className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        ),
      )}
      {canManage ? (
        editing === "new" ? (
          <AddressForm businessId={businessId} customerId={customerId} googleEnabled={googleEnabled} onDone={() => setEditing(null)} />
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <MapPin className="size-4" aria-hidden="true" />
            Add address
          </Button>
        )
      ) : null}
    </div>
  );
}
