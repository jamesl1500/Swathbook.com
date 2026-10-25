"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { AddressInput, emptyAddress, type AddressValue } from "@/components/booking/address-input";
import { PaymentForm } from "@/components/booking/payment-form";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { PublicService } from "@/libs/booking-page";
import { customerBookingPath } from "@/libs/routes";
import type { PaymentSession } from "@/libs/stripe/payments";
import { addDays, formatDateShort, formatTime, toDateKey } from "@/libs/time";
import { brandTextColor, cn, formatCents, formatDuration } from "@/libs/utils";
import { getAvailability, submitBooking, type Slot } from "./actions";

type Step = "services" | "time" | "details" | "pay";

function priceText(service: PublicService, currency: string) {
  if (service.price_type === "quote") return "Quote";
  const amount = formatCents(service.price_cents, currency);
  return service.price_type === "starting_at" ? `From ${amount}` : amount;
}

export function BookingFlow({
  slug,
  services,
  timeZone,
  currency,
  brandColor,
  acceptsPayments,
  googleEnabled,
  startDate,
}: {
  slug: string;
  services: PublicService[];
  timeZone: string;
  currency: string;
  brandColor: string;
  acceptsPayments: boolean;
  googleEnabled: boolean;
  startDate: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("services");
  const [selected, setSelected] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState(startDate);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [customer, setCustomer] = useState({ fullName: "", email: "", phone: "" });
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [notes, setNotes] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string[]>>>({});
  const [payment, setPayment] = useState<{ token: string; session: PaymentSession } | null>(null);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const chosen = services.filter((service) => selected.includes(service.id));
  const totals = useMemo(
    () => ({
      minutes: chosen.reduce((sum, service) => sum + service.duration_minutes, 0),
      price: chosen.reduce((sum, service) => sum + (service.price_type === "quote" ? 0 : service.price_cents), 0),
      deposit: acceptsPayments ? chosen.reduce((sum, service) => sum + service.deposit_cents, 0) : 0,
    }),
    [chosen, acceptsPayments],
  );

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const item of slots ?? []) {
      const key = toDateKey(new Date(item.start), timeZone);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [slots, timeZone]);

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  useEffect(() => {
    if (step !== "time" || selected.length === 0) return;
    startLoading(async () => {
      const result = await getAvailability({ slug, serviceIds: selected, from: weekStart, days: 7 });
      if ("error" in result) {
        setSlotError(result.error);
        setSlots([]);
        return;
      }
      setSlotError(null);
      setSlots(result.slots);
      setDay((current) => {
        if (current && result.slots.some((item) => toDateKey(new Date(item.start), timeZone) === current)) return current;
        return result.slots.length ? toDateKey(new Date(result.slots[0].start), timeZone) : null;
      });
    });
  }, [step, selected, slug, weekStart, timeZone]);

  function toggle(serviceId: string) {
    setSlot(null);
    setSelected((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]));
  }

  function book() {
    setSubmitError(null);
    setFieldErrors({});
    startSubmit(async () => {
      const result = await submitBooking({
        slug,
        serviceIds: selected,
        start: slot!.start,
        customer,
        address: { ...address },
        notes,
        company: honeypot,
      });
      if (!result.ok) {
        setSubmitError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        if (result.error.includes("just booked")) {
          setSlot(null);
          setStep("time");
        }
        return;
      }
      if (result.payment) {
        setPayment({ token: result.token, session: result.payment });
        setStep("pay");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        router.push(customerBookingPath(result.token));
      }
    });
  }

  if (services.length === 0) {
    return (
      <section className="rounded-[1.5rem] border border-line bg-card p-8 text-center">
        <h2 className="text-xl font-bold">No services are bookable online yet</h2>
        <p className="mt-2 text-ink-soft">Please contact the business directly to schedule.</p>
      </section>
    );
  }

  const steps: Array<{ id: Step; label: string }> = [
    { id: "services", label: "Service" },
    { id: "time", label: "Time" },
    { id: "details", label: "Details" },
    ...(totals.deposit > 0 ? [{ id: "pay" as Step, label: "Deposit" }] : []),
  ];
  const stepIndex = steps.findIndex((item) => item.id === step);

  return (
    <div className="min-w-0">
      <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Booking steps">
        {steps.map((item, index) => (
          <li
            key={item.id}
            aria-current={index === stepIndex ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold",
              index === stepIndex ? "" : index < stepIndex ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-ink-faint",
            )}
            style={index === stepIndex ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
          >
            {index < stepIndex ? <Check className="size-3.5" aria-hidden="true" /> : <span>{index + 1}</span>}
            {item.label}
          </li>
        ))}
      </ol>

      {step === "services" ? (
        <section aria-labelledby="pick-services">
          <h2 id="pick-services" className="text-2xl font-bold">
            What can we do for you?
          </h2>
          <p className="mt-1 text-ink-soft">Pick one or more services.</p>
          <ul className="mt-5 space-y-3">
            {services.map((service) => {
              const checked = selected.includes(service.id);
              return (
                <li key={service.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-4 rounded-[1.25rem] border bg-card p-4 transition-colors hover:border-ink-faint sm:p-5",
                      checked ? "border-transparent ring-2" : "border-line",
                    )}
                    style={checked ? ({ "--tw-ring-color": brandColor } as React.CSSProperties) : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(service.id)}
                      className="mt-1 size-5 shrink-0"
                      style={{ accentColor: brandColor }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-lg font-semibold">{service.name}</span>
                        <span className="font-display text-lg font-bold">{priceText(service, currency)}</span>
                      </span>
                      {service.description ? <span className="mt-1 block text-sm text-ink-soft">{service.description}</span> : null}
                      <span className="mt-2 block text-sm text-ink-faint">
                        {formatDuration(service.duration_minutes)}
                        {acceptsPayments && service.deposit_cents > 0 ? ` · ${formatCents(service.deposit_cents, currency)} deposit to book` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <StickyNext
            disabled={selected.length === 0}
            onNext={() => setStep("time")}
            summary={selected.length ? `${selected.length} selected · ${formatDuration(totals.minutes)}` : "Pick a service to continue"}
            brandColor={brandColor}
          />
        </section>
      ) : null}

      {step === "time" ? (
        <section aria-labelledby="pick-time">
          <h2 id="pick-time" className="text-2xl font-bold">
            Pick a time
          </h2>
          <p className="mt-1 text-ink-soft">Times are in the business&apos;s local time zone.</p>

          <div className="mt-5 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" disabled={weekStart <= startDate || loading} onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Earlier
            </Button>
            <span className="text-sm font-semibold text-ink-soft">
              {formatDateShort(days[0])} – {formatDateShort(days[6])}
            </span>
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Later
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5" role="tablist" aria-label="Days">
            {days.map((key) => {
              const count = slotsByDay.get(key)?.length ?? 0;
              const [, , dayOfMonth] = key.split("-");
              const isActive = day === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  disabled={count === 0}
                  onClick={() => setDay(key)}
                  className={cn(
                    "flex flex-col items-center rounded-xl border py-2 text-xs font-semibold transition-colors disabled:opacity-35",
                    isActive ? "border-transparent" : "border-line bg-card hover:border-ink-faint",
                  )}
                  style={isActive ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
                >
                  <span>{formatDateShort(key).split(",")[0]}</span>
                  <span className="font-display text-lg">{Number(dayOfMonth)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 min-h-40" aria-live="polite">
            {loading && !slots ? (
              <p className="flex items-center gap-2 text-ink-soft">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Finding open times…
              </p>
            ) : slotError ? (
              <FormMessage>{slotError}</FormMessage>
            ) : day && slotsByDay.get(day)?.length ? (
              <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", loading && "opacity-60")}>
                {slotsByDay.get(day)!.map((item) => {
                  const isChosen = slot?.start === item.start;
                  return (
                    <button
                      key={item.start}
                      type="button"
                      onClick={() => setSlot(item)}
                      aria-pressed={isChosen}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                        isChosen ? "border-transparent" : "border-line bg-card hover:border-ink-faint",
                      )}
                      style={isChosen ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
                    >
                      {formatTime(item.start, timeZone)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-paper-deep/60 px-4 py-6 text-center text-ink-soft">No open times this week. Try later dates.</p>
            )}
          </div>

          <StepNav onBack={() => setStep("services")}>
            <StickyNext
              inline
              disabled={!slot}
              onNext={() => setStep("details")}
              summary={slot ? `${formatDateShort(toDateKey(new Date(slot.start), timeZone))} at ${formatTime(slot.start, timeZone)}` : "Pick a time"}
              brandColor={brandColor}
            />
          </StepNav>
        </section>
      ) : null}

      {step === "details" && slot ? (
        <section aria-labelledby="your-details">
          <h2 id="your-details" className="text-2xl font-bold">
            Where should we come?
          </h2>
          <p className="mt-1 text-ink-soft">
            {chosen.map((service) => service.name).join(", ")} · {formatDateShort(toDateKey(new Date(slot.start), timeZone))} at{" "}
            {formatTime(slot.start, timeZone)}
          </p>

          <form
            className="mt-6 space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              book();
            }}
          >
            {submitError ? <FormMessage>{submitError}</FormMessage> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="fullName" error={fieldErrors["customer.fullName"]?.[0]} className="sm:col-span-2">
                <Input id="fullName" autoComplete="name" value={customer.fullName} onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })} required />
              </Field>
              <Field label="Email" htmlFor="email" error={fieldErrors["customer.email"]?.[0]} hint="We'll send your confirmation here.">
                <Input id="email" type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} required />
              </Field>
              <Field label={<>Phone <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor="phone" error={fieldErrors["customer.phone"]?.[0]}>
                <Input id="phone" type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} />
              </Field>
            </div>

            <AddressInput
              value={address}
              onChange={setAddress}
              googleEnabled={googleEnabled}
              errors={{ line1: fieldErrors["address.line1"]?.[0] }}
            />

            <Field label={<>Anything we should know? <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor="notes">
              <textarea
                id="notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Gate code, where to park, pets at home…"
                className="block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[0.95rem] focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200"
              />
            </Field>

            {/* Honeypot for bots: hidden from people and assistive tech. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="company">Company</label>
              <input id="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
            </div>

            <div className="rounded-[1.25rem] border border-line bg-card p-5">
              <dl className="space-y-2 text-sm">
                {chosen.map((service) => (
                  <div key={service.id} className="flex justify-between gap-3">
                    <dt>{service.name}</dt>
                    <dd className="font-semibold">{priceText(service, currency)}</dd>
                  </div>
                ))}
                {totals.deposit > 0 ? (
                  <div className="flex justify-between gap-3 border-t border-line pt-2">
                    <dt className="font-semibold">Deposit due now</dt>
                    <dd className="font-display text-lg font-bold">{formatCents(totals.deposit, currency)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <StepNav onBack={() => setStep("time")}>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold disabled:opacity-60"
                style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
              >
                {submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="size-4" aria-hidden="true" />}
                {totals.deposit > 0 ? "Continue to deposit" : "Book it"}
              </button>
            </StepNav>
          </form>
        </section>
      ) : null}

      {step === "pay" && payment ? (
        <section aria-labelledby="pay-deposit">
          <h2 id="pay-deposit" className="text-2xl font-bold">
            Pay your deposit
          </h2>
          <p className="mt-1 text-ink-soft">
            We&apos;re holding your time for 15 minutes. Your booking is confirmed as soon as the deposit goes through.
          </p>
          <div className="mt-6 rounded-[1.25rem] border border-line bg-card p-5 sm:p-6">
            <PaymentForm
              clientSecret={payment.session.clientSecret}
              stripeAccountId={payment.session.stripeAccountId}
              amountLabel={formatCents(payment.session.amountCents, currency)}
              returnUrl={`${window.location.origin}${customerBookingPath(payment.token)}?paid=1`}
              brandColor={brandColor}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepNav({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </Button>
      {children}
    </div>
  );
}

function StickyNext({
  disabled,
  onNext,
  summary,
  brandColor,
  inline,
}: {
  disabled: boolean;
  onNext: () => void;
  summary: string;
  brandColor: string;
  inline?: boolean;
}) {
  return (
    <div className={cn(inline ? "flex items-center gap-4" : "sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] mt-6 flex items-center justify-between gap-4 rounded-full border border-line bg-card/95 p-2 pl-5 shadow-lift backdrop-blur")}>
      <span className="text-sm font-semibold text-ink-soft">{summary}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-semibold disabled:opacity-40"
        style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
      >
        Continue
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
