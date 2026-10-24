"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  LoaderCircle,
  PartyPopper,
  Pencil,
  Plus,
  Trash,
} from "lucide-react";
import { BookingCard } from "@/components/booking/booking-card";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, Select, inputStyles } from "@/components/ui/field";
import { siteConfig } from "@/libs/globals/site";
import { findTrade, trades } from "@/libs/marketing/content";
import { cn, formatDuration, formatPrice, slugify } from "@/libs/utils";
import { checkSlugAvailability, completeOnboarding } from "./actions";
import { onboardingSchema, type OnboardingInput, type OnboardingValues } from "./schema";

type StepId = "business" | "link" | "services" | "schedule" | "review";

const STEPS: Array<{ id: StepId; label: string; fields: FieldPath<OnboardingInput>[] }> = [
  { id: "business", label: "Your business", fields: ["businessName", "trade", "phone"] },
  { id: "link", label: "Booking link", fields: ["slug"] },
  { id: "services", label: "Services", fields: ["services"] },
  { id: "schedule", label: "Area & hours", fields: ["baseAddress", "serviceRadiusMiles", "workDays", "dayStart", "dayEnd"] },
  { id: "review", label: "Go live", fields: [] },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const DEPOSITS = [0, 10, 20, 25, 30, 50, 100];
const RADII = [5, 10, 15, 25, 40, 60, 100];

export type OnboardingDefaults = {
  firstName: string;
  businessName: string;
  slug: string;
  /** The user already runs a business and is adding another. */
  isAdditionalBusiness?: boolean;
};

export function OnboardingWizard({ defaults }: { defaults: OnboardingDefaults }) {
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults.slug));
  const [servicesTouched, setServicesTouched] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    trigger,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<OnboardingInput, unknown, OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      businessName: defaults.businessName,
      trade: "",
      phone: "",
      slug: defaults.slug,
      services: [],
      baseAddress: "",
      serviceRadiusMiles: 15,
      workDays: [1, 2, 3, 4, 5],
      dayStart: "08:00",
      dayEnd: "17:00",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "services" });
  const preview = useWatch({ control });

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const trade = findTrade(preview.trade);

  async function goNext() {
    setAdvancing(true);
    try {
      const valid = await trigger(current.fields, { shouldFocus: true });
      if (!valid) return;

      if (current.id === "business") {
        const { businessName, trade: tradeId } = getValues();
        if (!slugTouched) setValue("slug", slugify(businessName));
        if (!servicesTouched) replace(findTrade(tradeId)?.sampleServices ?? []);
      }

      if (current.id === "link") {
        const result = await checkSlugAvailability(getValues("slug"));
        if (!result.available) {
          setError("slug", { message: result.reason ?? "That link isn't available." }, { shouldFocus: true });
          return;
        }
      }

      if (current.id === "services") setServicesTouched(true);

      setStep((value) => value + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setAdvancing(false);
    }
  }

  function goTo(index: number) {
    setStep(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const submit = handleSubmit(
    (values) => {
      startSubmit(async () => {
        const result = await completeOnboarding({
          ...values,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (!result) return;
        toast.error(result.error);
        if (result.field === "slug") {
          goTo(STEPS.findIndex((item) => item.id === "link"));
          setError("slug", { message: result.error });
        }
      });
    },
    () => toast.error("A few details need another look before you go live."),
  );

  const busy = advancing || submitting;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14 lg:py-14">
      <div>
        <StepProgress current={step} onSelect={(index) => index < step && goTo(index)} />

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (isLast) submit();
            else goNext();
          }}
          className="mt-10"
        >
          <StepHeader id={current.id} firstName={defaults.firstName} isAdditionalBusiness={defaults.isAdditionalBusiness} />

          <div key={current.id} className="mt-8 animate-rise">
            {current.id === "business" ? (
              <div className="space-y-7">
                <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message}>
                  <Input
                    id="businessName"
                    autoComplete="organization"
                    placeholder="e.g. Shine On Mobile Detailing"
                    aria-invalid={Boolean(errors.businessName) || undefined}
                    {...register("businessName")}
                  />
                </Field>

                <fieldset>
                  <legend className="text-sm font-semibold">What kind of work do you do?</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {trades.map((option) => {
                      const Icon = option.icon;
                      return (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-3 text-sm font-semibold transition-colors hover:border-ink-faint has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:ring-1 has-checked:ring-brand-500 has-focus-visible:ring-3 has-focus-visible:ring-brand-200"
                        >
                          <input type="radio" value={option.id} className="sr-only" {...register("trade")} />
                          <Icon className="size-4 shrink-0 text-brand-500" aria-hidden="true" />
                          {option.name}
                        </label>
                      );
                    })}
                  </div>
                  <FieldError message={errors.trade?.message} />
                </fieldset>

                <Field
                  label={
                    <>
                      Business phone <span className="font-normal text-ink-faint">(optional)</span>
                    </>
                  }
                  htmlFor="phone"
                  hint="Shown on your booking page so customers can reach you."
                  error={errors.phone?.message}
                >
                  <Input id="phone" type="tel" autoComplete="tel" placeholder="(555) 123-4567" {...register("phone")} />
                </Field>
              </div>
            ) : null}

            {current.id === "link" ? (
              <div className="space-y-6">
                <Field
                  label="Your booking link"
                  htmlFor="slug"
                  hint="Lowercase letters, numbers and dashes. Short and easy to say out loud works best."
                  error={errors.slug?.message}
                >
                  <div
                    className={cn(
                      inputStyles,
                      "flex items-center gap-0 p-0 focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-200",
                      errors.slug && "border-clay",
                    )}
                  >
                    <span className="shrink-0 border-r border-line py-2.5 pl-3.5 pr-2 font-mono text-sm text-ink-faint">
                      {siteConfig.bookingHost}/
                    </span>
                    <input
                      id="slug"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-2 py-2.5 font-mono text-sm font-semibold outline-none"
                      aria-invalid={Boolean(errors.slug) || undefined}
                      {...register("slug", {
                        onChange: () => setSlugTouched(true),
                        onBlur: (event) => setValue("slug", slugify(event.target.value)),
                      })}
                    />
                  </div>
                </Field>
                <div className="rounded-2xl border border-line bg-card p-5 text-sm text-ink-soft">
                  <p className="font-semibold text-ink">Where you&apos;ll use it</p>
                  <p className="mt-1">
                    Text it to customers, add it to your Google Business profile, print it on your truck and door
                    hangers. Every place you put it becomes a way to get booked.
                  </p>
                </div>
              </div>
            ) : null}

            {current.id === "services" ? (
              <fieldset className="space-y-3" onChange={() => setServicesTouched(true)}>
                <legend className="sr-only">Services</legend>
                <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_6.5rem_2.5rem] gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint sm:grid">
                  <span>Service</span>
                  <span>Price</span>
                  <span>Takes</span>
                  <span>Deposit</span>
                  <span className="sr-only">Remove</span>
                </div>

                {fields.map((field, index) => {
                  const rowErrors = errors.services?.[index];
                  return (
                    <div key={field.id} className="rounded-2xl border border-line bg-card p-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_6.5rem_2.5rem] sm:items-center">
                        <div className="col-span-2 sm:col-span-1">
                          <label htmlFor={`service-${index}-name`} className="sr-only">
                            Service name
                          </label>
                          <Input
                            id={`service-${index}-name`}
                            placeholder="Service name"
                            aria-invalid={Boolean(rowErrors?.name) || undefined}
                            {...register(`services.${index}.name`)}
                          />
                        </div>
                        <div className="relative">
                          <label htmlFor={`service-${index}-price`} className="sr-only">
                            Price in dollars
                          </label>
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
                            $
                          </span>
                          <Input
                            id={`service-${index}-price`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            className="pl-7"
                            aria-invalid={Boolean(rowErrors?.price) || undefined}
                            {...register(`services.${index}.price`, { valueAsNumber: true })}
                          />
                        </div>
                        <div>
                          <label htmlFor={`service-${index}-duration`} className="sr-only">
                            Duration
                          </label>
                          <Select
                            id={`service-${index}-duration`}
                            {...register(`services.${index}.durationMinutes`, { valueAsNumber: true })}
                          >
                            {DURATIONS.map((minutes) => (
                              <option key={minutes} value={minutes}>
                                {formatDuration(minutes)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <label htmlFor={`service-${index}-deposit`} className="sr-only">
                            Deposit percentage
                          </label>
                          <Select
                            id={`service-${index}-deposit`}
                            {...register(`services.${index}.depositPercent`, { valueAsNumber: true })}
                          >
                            {DEPOSITS.map((percent) => (
                              <option key={percent} value={percent}>
                                {percent === 0 ? "None" : `${percent}%`}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setServicesTouched(true);
                            remove(index);
                          }}
                          className="grid size-10 place-items-center justify-self-end rounded-lg text-ink-faint hover:bg-clay-soft hover:text-clay"
                        >
                          <Trash className="size-4" aria-hidden="true" />
                          <span className="sr-only">Remove {preview.services?.[index]?.name || "service"}</span>
                        </button>
                      </div>
                      <FieldError message={rowErrors?.name?.message ?? rowErrors?.price?.message} />
                    </div>
                  );
                })}

                <FieldError message={errors.services?.message ?? errors.services?.root?.message} />

                <Button
                  variant="secondary"
                  onClick={() => {
                    setServicesTouched(true);
                    append({ name: "", price: 50, durationMinutes: 60, depositPercent: 20 });
                  }}
                  disabled={fields.length >= 20}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add a service
                </Button>

                <p className="pt-2 text-sm text-ink-faint">
                  Deposits are charged when a customer books and subtracted from the final bill.
                </p>
              </fieldset>
            ) : null}

            {current.id === "schedule" ? (
              <div className="space-y-7">
                <Field
                  label="Where does your day start?"
                  htmlFor="baseAddress"
                  hint="Your shop, garage or home. Only you see this; we use it to plan routes."
                  error={errors.baseAddress?.message}
                >
                  <Input
                    id="baseAddress"
                    autoComplete="street-address"
                    placeholder="123 Main St, Springfield"
                    aria-invalid={Boolean(errors.baseAddress) || undefined}
                    {...register("baseAddress")}
                  />
                </Field>

                <Field
                  label="How far will you travel?"
                  htmlFor="serviceRadiusMiles"
                  hint="Customers outside this area won't be able to book."
                  error={errors.serviceRadiusMiles?.message}
                >
                  <Select id="serviceRadiusMiles" {...register("serviceRadiusMiles", { valueAsNumber: true })}>
                    {RADII.map((miles) => (
                      <option key={miles} value={miles}>
                        Within {miles} miles
                      </option>
                    ))}
                  </Select>
                </Field>

                <fieldset>
                  <legend className="text-sm font-semibold">Which days do you work?</legend>
                  <Controller
                    control={control}
                    name="workDays"
                    render={({ field }) => (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {DAYS.map((day, index) => {
                          const selected = field.value?.includes(index) ?? false;
                          return (
                            <button
                              key={day}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                field.onChange(
                                  selected
                                    ? field.value.filter((value) => value !== index)
                                    : [...(field.value ?? []), index].sort((a, b) => a - b),
                                )
                              }
                              className={cn(
                                "h-11 w-14 rounded-xl border text-sm font-semibold transition-colors",
                                selected
                                  ? "border-brand-600 bg-brand-600 text-paper"
                                  : "border-line bg-card text-ink-soft hover:border-ink-faint",
                              )}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                  <FieldError message={errors.workDays?.message} />
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Start time" htmlFor="dayStart" error={errors.dayStart?.message}>
                    <Input id="dayStart" type="time" step={900} {...register("dayStart")} />
                  </Field>
                  <Field label="End time" htmlFor="dayEnd" error={errors.dayEnd?.message}>
                    <Input id="dayEnd" type="time" step={900} {...register("dayEnd")} />
                  </Field>
                </div>
              </div>
            ) : null}

            {current.id === "review" ? (
              <div className="space-y-4">
                <ReviewRow title="Business" onEdit={() => goTo(0)}>
                  {preview.businessName} · {trade?.name}
                  {preview.phone ? ` · ${preview.phone}` : ""}
                </ReviewRow>
                <ReviewRow title="Booking link" onEdit={() => goTo(1)}>
                  <span className="font-mono">
                    {siteConfig.bookingHost}/{preview.slug}
                  </span>
                </ReviewRow>
                <ReviewRow title={`${preview.services?.length ?? 0} services`} onEdit={() => goTo(2)}>
                  <ul className="space-y-1">
                    {preview.services?.map((service, index) => (
                      <li key={index} className="flex justify-between gap-4">
                        <span className="truncate">{service.name}</span>
                        <span className="shrink-0 text-ink-faint">
                          {formatPrice(service.price || 0)} · {formatDuration(service.durationMinutes || 0)}
                          {service.depositPercent ? ` · ${service.depositPercent}% deposit` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ReviewRow>
                <ReviewRow title="Area & hours" onEdit={() => goTo(3)}>
                  Within {preview.serviceRadiusMiles} miles of {preview.baseAddress}
                  <br />
                  {(preview.workDays ?? []).map((day) => DAYS[day ?? 0]).join(", ")} · {preview.dayStart}–
                  {preview.dayEnd}
                </ReviewRow>

                <div className="flex gap-4 rounded-2xl border border-sun/60 bg-sun-soft p-5">
                  <CreditCard className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="font-semibold">Next up: connect payouts</p>
                    <p className="mt-1 text-ink-soft">
                      To collect deposits and payments, you&apos;ll connect a bank account from your dashboard. It
                      takes about three minutes. Until then, customers can still book without paying online.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={busy}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="lg" variant={isLast ? "accent" : "primary"} disabled={busy}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {isLast ? (
                <>
                  {submitting ? "Launching…" : "Launch my booking page"}
                  {!submitting ? <PartyPopper className="size-4" aria-hidden="true" /> : null}
                </>
              ) : (
                <>
                  Continue
                  {!busy ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      <aside className="hidden lg:block" aria-label="Booking page preview">
        <div className="sticky top-24">
          <p className="label-tag mb-3 flex items-center gap-2 text-ink-faint">
            <span className="size-2 animate-pulse rounded-full bg-sky" aria-hidden="true" />
            Live preview
          </p>
          <BookingCard
            businessName={preview.businessName ?? ""}
            tagline={trade ? `${trade.name} · Book online` : undefined}
            slug={preview.slug ?? ""}
            services={(preview.services ?? []).map((service) => ({
              name: service?.name ?? "",
              price: Number.isFinite(service?.price) ? (service?.price as number) : 0,
              durationMinutes: service?.durationMinutes ?? 60,
              depositPercent: service?.depositPercent ?? 0,
            }))}
          />
          <p className="mt-4 text-center text-sm text-ink-faint">This is what customers see when they open your link.</p>
        </div>
      </aside>
    </div>
  );
}

function StepHeader({
  id,
  firstName,
  isAdditionalBusiness,
}: {
  id: StepId;
  firstName: string;
  isAdditionalBusiness?: boolean;
}) {
  const greeting = isAdditionalBusiness
    ? "Let's add another business"
    : firstName
      ? `Hey ${firstName}, let's set up your business`
      : "Let's set up your business";

  const copy: Record<StepId, { title: string; description: string }> = {
    business: {
      title: greeting,
      description: "This shows at the top of your booking page. Pick your trade and we'll suggest a starter menu.",
    },
    link: {
      title: "Pick your booking link",
      description: "This is the link customers use to book you. You can change it later.",
    },
    services: {
      title: "What do you offer?",
      description: "We started you off with common services for your trade. Tweak names, prices, time and deposits to match yours.",
    },
    schedule: {
      title: "Where and when do you work?",
      description: "Customers will only see openings inside your hours and service area, and your routes start from here.",
    },
    review: {
      title: "Look good? Let's go live.",
      description: "Double-check the basics. You can change all of this later from your dashboard.",
    },
  };

  return (
    <div>
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{copy[id].title}</h1>
      <p className="mt-2.5 max-w-xl leading-relaxed text-ink-soft">{copy[id].description}</p>
    </div>
  );
}

function StepProgress({ current, onSelect }: { current: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Setup progress">
      <p className="label-tag text-ink-faint sm:hidden">
        Step {current + 1} of {STEPS.length} · {STEPS[current].label}
      </p>
      <ol className="mt-3 flex gap-1.5 sm:mt-0 sm:gap-2">
        {STEPS.map((item, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={item.id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={!done}
                aria-current={active ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    "block h-2 rounded-full transition-colors",
                    done && "bg-brand-500 group-hover:bg-brand-600",
                    active && "map-grid",
                    !done && !active && "bg-paper-deep",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 hidden items-center gap-1.5 text-xs font-semibold sm:flex",
                    active ? "text-ink" : "text-ink-faint",
                  )}
                >
                  {done ? <Check className="size-3.5 text-brand-500" aria-hidden="true" /> : null}
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ReviewRow({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-card p-5">
      <div className="min-w-0 flex-1">
        <p className="label-tag text-ink-faint">{title}</p>
        <div className="mt-1.5 text-[0.95rem]">{children}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </button>
    </div>
  );
}
