"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { AddressInput, emptyAddress, type AddressValue } from "@/components/booking/address-input";
import { Field, FieldError, FormMessage, Input, Select, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn, formatCents, formatDuration } from "@/libs/utils";
import { createManualBooking, searchCustomers, type CustomerOption } from "../actions";

type ServiceOption = { id: string; name: string; price_cents: number; duration_minutes: number };

export function NewJobForm({
  businessId,
  services,
  team,
  currency,
  defaultDate,
  googleEnabled,
  initialCustomer,
}: {
  businessId: string;
  services: ServiceOption[];
  team: Array<{ id: string; name: string }>;
  currency: string;
  defaultDate: string;
  googleEnabled: boolean;
  initialCustomer: CustomerOption | null;
}) {
  const [state, formAction] = useActionState(createManualBooking, {});
  const errors = state.fieldErrors ?? {};
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [addressChoice, setAddressChoice] = useState(() => initialCustomer?.addresses.find((address) => address.isPrimary)?.id ?? initialCustomer?.addresses[0]?.id ?? "new");
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [picked, setPicked] = useState<string[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function search(text: string) {
    setQuery(text);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => setResults(await searchCustomers(businessId, text)), 200);
  }

  function chooseCustomer(option: CustomerOption) {
    setCustomer(option);
    setResults([]);
    setQuery("");
    setAddressChoice(option.addresses.find((item) => item.isPrimary)?.id ?? option.addresses[0]?.id ?? "new");
  }

  const minutes = services.filter((service) => picked.includes(service.id)).reduce((sum, service) => sum + service.duration_minutes, 0);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Customer</legend>
        {customer ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <input type="hidden" name="customerId" value={customer.id} />
            <span>
              <span className="block font-semibold">{customer.fullName}</span>
              <span className="block text-sm text-ink-soft">{[customer.email, customer.phone].filter(Boolean).join(" · ")}</span>
            </span>
            <button type="button" onClick={() => setCustomer(null)} className="grid size-8 place-items-center rounded-lg hover:bg-paper" aria-label="Choose a different customer">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : creatingCustomer ? (
          <div className="space-y-3 rounded-xl border border-line p-4">
            <Field label="Name" htmlFor="newCustomerName">
              <Input id="newCustomerName" name="newCustomerName" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="newCustomerEmail">
                <Input id="newCustomerEmail" name="newCustomerEmail" type="email" />
              </Field>
              <Field label="Phone" htmlFor="newCustomerPhone">
                <Input id="newCustomerPhone" name="newCustomerPhone" type="tel" />
              </Field>
            </div>
            <button type="button" onClick={() => setCreatingCustomer(false)} className="text-sm font-semibold text-brand-600">
              Search existing customers instead
            </button>
          </div>
        ) : (
          <div className="relative">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-ink-faint" aria-hidden="true" />
            <Input
              id="customer-search"
              value={query}
              onChange={(event) => search(event.target.value)}
              onFocus={() => !results.length && search(query)}
              placeholder="Search by name, email or phone"
              className="pl-9"
              autoComplete="off"
              aria-invalid={Boolean(errors.customer) || undefined}
            />
            {results.length ? (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-card shadow-lift" role="listbox">
                {results.map((option) => (
                  <li key={option.id} role="option" aria-selected="false">
                    <button type="button" onClick={() => chooseCustomer(option)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-paper">
                      <span className="font-semibold">{option.fullName}</span>
                      <span className="block text-ink-faint">{[option.email, option.phone].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button type="button" onClick={() => setCreatingCustomer(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
              <UserPlus className="size-4" aria-hidden="true" />
              New customer
            </button>
          </div>
        )}
        <FieldError message={errors.customer?.[0]} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Where</legend>
        {customer?.addresses.length ? (
          <Select name="addressId" value={addressChoice} onChange={(event) => setAddressChoice(event.target.value)} aria-label="Service address">
            {customer.addresses.map((option) => (
              <option key={option.id} value={option.id}>
                {option.line1}
                {option.city ? `, ${option.city}` : ""}
                {option.isPrimary ? " (primary)" : ""}
              </option>
            ))}
            <option value="new">A different address…</option>
          </Select>
        ) : (
          <input type="hidden" name="addressId" value="new" />
        )}
        {!customer?.addresses.length || addressChoice === "new" ? (
          <AddressInput value={address} onChange={setAddress} googleEnabled={googleEnabled} errors={{ line1: errors.line1?.[0] }} />
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Services</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <label
              key={service.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                picked.includes(service.id) ? "border-brand-500 bg-brand-50" : "border-line",
              )}
            >
              <input
                type="checkbox"
                name="serviceIds"
                value={service.id}
                checked={picked.includes(service.id)}
                onChange={(event) => setPicked((current) => (event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id)))}
                className="size-4 accent-[var(--color-brand-600)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{service.name}</span>
                <span className="text-ink-faint">
                  {formatCents(service.price_cents, currency)} · {formatDuration(service.duration_minutes)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError message={errors.serviceIds?.[0]} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" error={errors.date?.[0]}>
          <Input id="date" name="date" type="date" defaultValue={defaultDate} required />
        </Field>
        <Field label="Start time" htmlFor="time" hint={minutes ? `Takes ${formatDuration(minutes)}` : undefined} error={errors.time?.[0]}>
          <Input id="time" name="time" type="time" step={900} defaultValue="09:00" required />
        </Field>
        <Field label="Assign to" htmlFor="memberId">
          <Select id="memberId" name="memberId" defaultValue={team[0]?.id ?? ""}>
            <option value="">Unassigned</option>
            {team.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Note for the customer" htmlFor="customerNotes">
          <textarea id="customerNotes" name="customerNotes" rows={2} maxLength={2000} className={inputStyles} />
        </Field>
        <Field label="Team notes" htmlFor="internalNotes">
          <textarea id="internalNotes" name="internalNotes" rows={2} maxLength={5000} className={inputStyles} />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="status" value="requested" className="size-4 accent-[var(--color-brand-600)]" />
        Tentative (mark as a request until the customer confirms)
      </label>

      <SubmitButton size="lg" pendingLabel="Creating…">
        Create job
      </SubmitButton>
    </form>
  );
}
