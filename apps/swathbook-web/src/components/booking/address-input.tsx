"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { resolveAddress, suggestAddresses } from "@/app/actions/address";
import { Field, Input } from "@/components/ui/field";
import type { AddressSuggestion } from "@/libs/google/maps";
import { cn } from "@/libs/utils";

export type AddressValue = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
};

export const emptyAddress: AddressValue = { line1: "", line2: "", city: "", region: "", postalCode: "", placeId: "", lat: null, lng: null };

/**
 * Street address with Google Places suggestions (when enabled) plus the usual
 * fields. Renders hidden inputs so it also works inside plain <form action>.
 */
export function AddressInput({
  name = "address",
  value,
  onChange,
  googleEnabled,
  errors = {},
  required = true,
}: {
  name?: string;
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  googleEnabled: boolean;
  errors?: Partial<Record<keyof AddressValue, string | undefined>>;
  required?: boolean;
}) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const sessionToken = useRef<string>("");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function update(patch: Partial<AddressValue>) {
    onChange({ ...value, ...patch });
  }

  function onStreetChange(text: string) {
    // Typing a new street invalidates the previous lookup's coordinates.
    update({ line1: text, placeId: "", lat: null, lng: null });
    if (!googleEnabled) return;
    clearTimeout(debounce.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    sessionToken.current ||= crypto.randomUUID();
    debounce.current = setTimeout(async () => {
      const results = await suggestAddresses(text, sessionToken.current);
      setSuggestions(results);
      setOpen(results.length > 0);
      setActive(-1);
    }, 250);
  }

  async function choose(suggestion: AddressSuggestion) {
    setOpen(false);
    update({ line1: suggestion.primary });
    const resolved = await resolveAddress(suggestion.placeId, sessionToken.current);
    sessionToken.current = "";
    if (!resolved) return;
    onChange({
      line1: resolved.line1 || suggestion.primary,
      line2: resolved.line2 ?? value.line2,
      city: resolved.city ?? "",
      region: resolved.region ?? "",
      postalCode: resolved.postalCode ?? "",
      placeId: resolved.placeId ?? suggestion.placeId,
      lat: resolved.lat,
      lng: resolved.lng,
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Field label="Street address" htmlFor={`${id}-line1`} error={errors.line1}>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <Input
              id={`${id}-line1`}
              value={value.line1}
              onChange={(event) => onStreetChange(event.target.value)}
              onFocus={() => setOpen(suggestions.length > 0)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(event) => {
                if (!open) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, suggestions.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter" && active >= 0) {
                  event.preventDefault();
                  void choose(suggestions[active]);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              autoComplete={googleEnabled ? "off" : "address-line1"}
              placeholder="123 Main St"
              required={required}
              role={googleEnabled ? "combobox" : undefined}
              aria-autocomplete={googleEnabled ? "list" : undefined}
              aria-expanded={googleEnabled ? open : undefined}
              aria-controls={googleEnabled ? `${id}-suggestions` : undefined}
              aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
              aria-invalid={Boolean(errors.line1) || undefined}
              className="pl-9"
            />
          </div>
        </Field>
        {open ? (
          <ul
            id={`${id}-suggestions`}
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-card shadow-lift"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.placeId}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void choose(suggestion);
                }}
                className={cn("cursor-pointer px-4 py-2.5 text-sm", index === active ? "bg-brand-50" : "hover:bg-paper")}
              >
                <span className="font-semibold">{suggestion.primary}</span>
                <span className="block text-ink-faint">{suggestion.secondary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Field label={<>Apt, suite or gate code <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor={`${id}-line2`}>
        <Input id={`${id}-line2`} value={value.line2} onChange={(event) => update({ line2: event.target.value })} autoComplete="address-line2" />
      </Field>

      <div className="grid grid-cols-6 gap-3">
        <Field label="City" htmlFor={`${id}-city`} className="col-span-6 sm:col-span-3" error={errors.city}>
          <Input id={`${id}-city`} value={value.city} onChange={(event) => update({ city: event.target.value })} autoComplete="address-level2" />
        </Field>
        <Field label="State" htmlFor={`${id}-region`} className="col-span-3 sm:col-span-1" error={errors.region}>
          <Input id={`${id}-region`} value={value.region} onChange={(event) => update({ region: event.target.value })} autoComplete="address-level1" maxLength={30} />
        </Field>
        <Field label="ZIP" htmlFor={`${id}-postal`} className="col-span-3 sm:col-span-2" error={errors.postalCode}>
          <Input id={`${id}-postal`} value={value.postalCode} onChange={(event) => update({ postalCode: event.target.value })} autoComplete="postal-code" inputMode="numeric" />
        </Field>
      </div>

      <input type="hidden" name={`${name}.line1`} value={value.line1} />
      <input type="hidden" name={`${name}.line2`} value={value.line2} />
      <input type="hidden" name={`${name}.city`} value={value.city} />
      <input type="hidden" name={`${name}.region`} value={value.region} />
      <input type="hidden" name={`${name}.postalCode`} value={value.postalCode} />
      <input type="hidden" name={`${name}.placeId`} value={value.placeId} />
      <input type="hidden" name={`${name}.lat`} value={value.lat ?? ""} />
      <input type="hidden" name={`${name}.lng`} value={value.lng ?? ""} />
    </div>
  );
}
