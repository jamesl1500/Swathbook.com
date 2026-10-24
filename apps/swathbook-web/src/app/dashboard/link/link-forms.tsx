"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, FormMessage, Input, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { siteConfig } from "@/libs/globals/site";
import { brandTextColor, cn, slugify } from "@/libs/utils";
import { setPublished, updateBookingPage } from "./actions";

function withToast(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  return async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) toast.success(result.success);
    return result;
  };
}

export function ProfileForm({
  businessId,
  values,
}: {
  businessId: string;
  values: { name: string; slug: string; description: string; phone: string; email: string; websiteUrl: string; brandColor: string };
}) {
  const [state, formAction] = useActionState(withToast(updateBookingPage), {});
  const errors = state.fieldErrors ?? {};
  const [color, setColor] = useState(values.brandColor);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}

      <Field label="Business name" htmlFor="name" error={errors.name?.[0]}>
        <Input id="name" name="name" defaultValue={values.name} required />
      </Field>

      <Field
        label="Booking link"
        htmlFor="slug"
        hint="Changing it breaks links you've already shared."
        error={errors.slug?.[0]}
      >
        <div className={cn(inputStyles, "flex items-center p-0 focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-200")}>
          <span className="shrink-0 border-r border-line py-2.5 pl-3.5 pr-2 font-mono text-sm text-ink-faint">{siteConfig.bookingHost}/</span>
          <input
            id="slug"
            name="slug"
            defaultValue={values.slug}
            autoCapitalize="none"
            spellCheck={false}
            onBlur={(event) => {
              event.target.value = slugify(event.target.value);
            }}
            className="min-w-0 flex-1 bg-transparent px-2 py-2.5 font-mono text-sm font-semibold outline-none"
          />
        </div>
      </Field>

      <Field label="About your business" htmlFor="description" hint="A sentence or two customers see at the top of your page." error={errors.description?.[0]}>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={values.description}
          placeholder="Family-owned and serving the Northside since 2014. Licensed and insured."
          className={inputStyles}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone" error={errors.phone?.[0]}>
          <Input id="phone" name="phone" type="tel" defaultValue={values.phone} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.[0]}>
          <Input id="email" name="email" type="email" defaultValue={values.email} />
        </Field>
      </div>

      <Field label="Website" htmlFor="websiteUrl" error={errors.websiteUrl?.[0]}>
        <Input id="websiteUrl" name="websiteUrl" defaultValue={values.websiteUrl} placeholder="yourbusiness.com" />
      </Field>

      <BrandColorField value={color} onChange={setColor} error={errors.brandColor?.[0]} businessName={values.name} />

      <SubmitButton pendingLabel="Saving…">Save booking page</SubmitButton>
    </form>
  );
}

export function PublishToggle({ businessId, published }: { businessId: string; published: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={published}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const formData = new FormData();
          formData.set("businessId", businessId);
          if (!published) formData.set("published", "on");
          const result = await setPublished(formData);
          if (result.error) toast.error(result.error);
          else toast.success(result.success);
        })
      }
      className="inline-flex items-center gap-3 rounded-full border border-line bg-card py-1.5 pl-1.5 pr-4 text-sm font-semibold disabled:opacity-60"
    >
      <span className={cn("relative h-6 w-11 rounded-full transition-colors", published ? "bg-brand-600" : "bg-line-strong")}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-paper transition-all", published ? "left-6" : "left-1")} />
      </span>
      {published ? "Taking bookings" : "Bookings paused"}
    </button>
  );
}

/** Trade-neutral starting points; any color works via the custom picker. */
const BRAND_SWATCHES = [
  { value: "#1c3d70", name: "Navy" },
  { value: "#0e7c86", name: "Teal" },
  { value: "#2f6b3a", name: "Forest" },
  { value: "#b42318", name: "Red" },
  { value: "#c2410c", name: "Orange" },
  { value: "#6b3fa0", name: "Purple" },
  { value: "#1f2933", name: "Charcoal" },
  { value: "#f2b705", name: "Gold" },
];

function BrandColorField({
  value,
  onChange,
  error,
  businessName,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  businessName: string;
}) {
  const color = /^#[0-9a-f]{6}$/i.test(value) ? value : "#1c3d70";
  const onBrand = brandTextColor(color);
  const isCustom = !BRAND_SWATCHES.some((swatch) => swatch.value === color.toLowerCase());
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">Brand color</legend>
      <p className="mb-3 text-sm text-ink-soft">Colors your page header and buttons. Text switches to dark or light to stay readable.</p>
      <input type="hidden" name="brandColor" value={color} />
      <div role="radiogroup" aria-label="Brand color" className="flex flex-wrap items-center gap-2">
        {BRAND_SWATCHES.map((swatch) => {
          const selected = swatch.value === color.toLowerCase();
          return (
            <button
              key={swatch.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={swatch.name}
              onClick={() => onChange(swatch.value)}
              className={cn(
                "size-11 rounded-full border-2 transition-transform",
                selected ? "scale-105 border-ink ring-2 ring-paper ring-offset-2 ring-offset-ink" : "border-transparent hover:scale-105",
              )}
              style={{ backgroundColor: swatch.value }}
            />
          );
        })}
        <label
          className={cn(
            "relative grid size-11 cursor-pointer place-items-center overflow-hidden rounded-full border-2 text-xs font-bold",
            isCustom ? "border-ink" : "border-line-strong",
          )}
          style={{ background: isCustom ? color : "conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)" }}
        >
          <span className="sr-only">Custom color</span>
          <input
            id="brandColor"
            type="color"
            value={color}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <span className="font-mono text-sm text-ink-soft">{color}</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-line" aria-hidden="true">
        <div className="px-4 py-3" style={{ backgroundColor: color, color: onBrand }}>
          <p className="truncate font-display text-lg font-bold">{businessName || "Your business"}</p>
          <p className="text-sm opacity-85">Book online in under a minute</p>
        </div>
        <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
          <span className="text-sm text-ink-soft">Preview</span>
          <span className="rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: color, color: onBrand }}>
            Book now
          </span>
        </div>
      </div>
      {error ? <p className="mt-1.5 text-sm text-clay-ink">{error}</p> : null}
    </fieldset>
  );
}
