"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, EyeOff, Pencil, Trash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import type { Database } from "@/libs/supabase/database.types";
import { cn, formatCents, formatDuration } from "@/libs/utils";
import { deleteService, moveService, saveService } from "./actions";

type Service = Database["public"]["Tables"]["services"]["Row"];

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

function centsToInput(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function priceLabel(service: Pick<Service, "price_type" | "price_cents">, currency: string) {
  if (service.price_type === "quote") return "Quote";
  const amount = formatCents(service.price_cents, currency);
  return service.price_type === "starting_at" ? `From ${amount}` : amount;
}

export function depositLabel(service: Pick<Service, "deposit_type" | "deposit_percent" | "deposit_amount_cents">, currency: string) {
  if (service.deposit_type === "percent") return `${service.deposit_percent}% deposit`;
  if (service.deposit_type === "fixed") return `${formatCents(service.deposit_amount_cents, currency)} deposit`;
  return "No deposit";
}

export function ServiceEditor({
  businessId,
  service,
  onDone,
  namePlaceholder = "e.g. Standard visit",
}: {
  businessId: string;
  service?: Service;
  onDone?: () => void;
  /** An example from the business's own trade. */
  namePlaceholder?: string;
}) {
  const [formKey, setFormKey] = useState(0);
  const [depositType, setDepositType] = useState(service?.deposit_type ?? "none");
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveService(prev, formData);
    if (result.success) {
      toast.success(result.success);
      if (service) onDone?.();
      else {
        setFormKey((key) => key + 1);
        setDepositType("none");
      }
    }
    return result;
  }, {});
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${service?.id ?? "new"}-${name}`;

  return (
    <form key={formKey} action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}

      <Field label="Name" htmlFor={id("name")} error={errors.name?.[0]}>
        <Input id={id("name")} name="name" defaultValue={service?.name} placeholder={namePlaceholder} required />
      </Field>

      <Field label={<>Description <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor={id("description")}>
        <textarea
          id={id("description")}
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={service?.description ?? ""}
          className="block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[0.95rem] focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price" htmlFor={id("price")} error={errors.priceCents?.[0]}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">$</span>
            <Input id={id("price")} name="price" inputMode="decimal" defaultValue={service ? centsToInput(service.price_cents) : ""} className="pl-7" />
          </div>
        </Field>
        <Field label="Pricing" htmlFor={id("priceType")}>
          <Select id={id("priceType")} name="priceType" defaultValue={service?.price_type ?? "fixed"}>
            <option value="fixed">Fixed price</option>
            <option value="starting_at">Starting at</option>
            <option value="quote">Quote on site</option>
          </Select>
        </Field>
      </div>

      <Field label="Takes about" htmlFor={id("duration")} error={errors.durationMinutes?.[0]}>
        <Select id={id("duration")} name="durationMinutes" defaultValue={service?.duration_minutes ?? 60}>
          {DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatDuration(minutes)}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">Deposit when booking</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["none", "percent", "fixed"] as const).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center justify-center rounded-xl border border-line px-2 py-2 text-sm font-semibold has-checked:border-brand-500 has-checked:bg-brand-50 has-focus-visible:ring-3 has-focus-visible:ring-brand-200"
            >
              <input
                type="radio"
                name="depositType"
                value={option}
                className="sr-only"
                checked={depositType === option}
                onChange={() => setDepositType(option)}
              />
              {option === "none" ? "None" : option === "percent" ? "Percent" : "Flat amount"}
            </label>
          ))}
        </div>
        {depositType === "percent" ? (
          <Field label="Deposit percentage" htmlFor={id("depositPercent")} error={errors.depositPercent?.[0]} className="mt-3">
            <Select id={id("depositPercent")} name="depositPercent" defaultValue={service?.deposit_percent || 25}>
              {[10, 15, 20, 25, 30, 40, 50, 100].map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {depositType === "fixed" ? (
          <Field label="Deposit amount" htmlFor={id("depositAmount")} error={errors.depositCents?.[0]} className="mt-3">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">$</span>
              <Input
                id={id("depositAmount")}
                name="depositAmount"
                inputMode="decimal"
                className="pl-7"
                defaultValue={service?.deposit_amount_cents ? centsToInput(service.deposit_amount_cents) : ""}
              />
            </div>
          </Field>
        ) : null}
      </fieldset>

      <div className="space-y-2 rounded-xl bg-paper px-3 py-3 text-sm">
        <label className="flex items-center gap-2.5">
          <input type="checkbox" name="isPublic" defaultChecked={service?.is_public ?? true} className="size-4 accent-[var(--color-brand-600)]" />
          Show on my booking page
        </label>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" name="isActive" defaultChecked={service?.is_active ?? true} className="size-4 accent-[var(--color-brand-600)]" />
          Active (uncheck to retire it without deleting)
        </label>
      </div>

      <div className="flex gap-2">
        <SubmitButton className="flex-1" pendingLabel="Saving…">
          {service ? "Save changes" : "Add service"}
        </SubmitButton>
        {service && onDone ? (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ServiceList({ businessId, services, currency }: { businessId: string; services: Service[]; currency: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (formData: FormData) => Promise<FormState>, fields: Record<string, string>) {
    const formData = new FormData();
    formData.set("businessId", businessId);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return (
    <ul className={cn("space-y-3", pending && "opacity-70")} aria-busy={pending}>
      {services.map((service, index) => (
        <li key={service.id} className="rounded-[1.25rem] border border-line bg-card p-4 sm:p-5" data-testid="service-row">
          {editing === service.id ? (
            <ServiceEditor businessId={businessId} service={service} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {service.name}
                  {!service.is_active ? <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink-soft">Retired</span> : null}
                  {service.is_active && !service.is_public ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink-soft">
                      <EyeOff className="size-3" aria-hidden="true" />
                      Hidden from booking page
                    </span>
                  ) : null}
                </p>
                {service.description ? <p className="mt-1 text-sm text-ink-soft">{service.description}</p> : null}
                <p className="mt-2 text-sm text-ink-soft">
                  <strong className="text-ink">{priceLabel(service, currency)}</strong> · {formatDuration(service.duration_minutes)} ·{" "}
                  {depositLabel(service, currency)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton label={`Move ${service.name} up`} disabled={index === 0 || pending} onClick={() => run(moveService, { serviceId: service.id, direction: "up" })}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move ${service.name} down`}
                  disabled={index === services.length - 1 || pending}
                  onClick={() => run(moveService, { serviceId: service.id, direction: "down" })}
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton label={`Edit ${service.name}`} onClick={() => setEditing(service.id)}>
                  <Pencil className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Delete ${service.name}`}
                  danger
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete "${service.name}"? Past bookings keep their details.`)) {
                      run(deleteService, { serviceId: service.id });
                    }
                  }}
                >
                  <Trash className="size-4" aria-hidden="true" />
                </IconButton>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-lg text-ink-faint transition-colors disabled:opacity-30",
        danger ? "hover:bg-clay-soft hover:text-clay" : "hover:bg-paper-deep hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
