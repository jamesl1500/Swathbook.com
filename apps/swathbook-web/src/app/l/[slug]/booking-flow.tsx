"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, ChevronLeft, ChevronRight, LoaderCircle, MapPin, Ruler, Tag } from "lucide-react";
import { AddressInput, emptyAddress, type AddressValue } from "@/components/booking/address-input";
import { MeasureMap } from "@/components/booking/measure-map";
import { PaymentForm } from "@/components/booking/payment-form";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import type { PublicService } from "@/libs/booking-page";
import { formatSqft, MAX_AREA_SQFT, MIN_AREA_SQFT, totalAreaSqft, type LatLng, type MapZoom, type Polygon } from "@/libs/measure/geo";
import { isMeasured, quoteBooking } from "@/libs/pricing";
import { customerBookingPath } from "@/libs/routes";
import { answerErrors, answersToSend, questionsFor } from "@/libs/service-questions";
import type { PaymentSession } from "@/libs/stripe/payments";
import { addDays, formatDateShort, formatTime, toDateKey } from "@/libs/time";
import { brandTextColor, cn, formatCents, formatDuration } from "@/libs/utils";
import { getAvailability, locateAddress, submitBooking, type Slot } from "./actions";
import { QuestionFields } from "./question-fields";

type Step = "services" | "where" | "measure" | "time" | "details" | "pay";

/** How the customer gave the area: drawn on the map, typed in, or not at all (priced on site). */
type Measurement = { kind: "drawn"; polygons: Polygon[] } | { kind: "entered"; text: string } | { kind: "skipped" };

function priceText(service: PublicService, currency: string) {
  if (service.price_type === "quote") return "Quote";
  const amount = formatCents(service.price_cents, currency);
  return service.price_type === "starting_at" ? `From ${amount}` : amount;
}

/** A line in the summary: measured services show their real price once measured. */
function linePriceText(line: { isQuote: boolean; isMinimum: boolean; priceCents: number }, service: PublicService, currency: string) {
  if (line.isQuote) return "Quote";
  const amount = formatCents(line.priceCents, currency);
  if (line.isMinimum) return `From ${amount}`;
  return service.price_type === "starting_at" && !isMeasured(service) ? `From ${amount}` : amount;
}

function enteredArea(text: string) {
  const value = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(value) ? Math.round(value) : Number.NaN;
}

/** The measured area, or null when there isn't one (yet). */
function areaOf(measurement: Measurement | null) {
  if (!measurement) return null;
  if (measurement.kind === "drawn") return measurement.polygons.length ? totalAreaSqft(measurement.polygons) : null;
  if (measurement.kind === "entered") {
    const value = enteredArea(measurement.text);
    return value >= MIN_AREA_SQFT && value <= MAX_AREA_SQFT ? value : null;
  }
  return null;
}

function measurementToSend(measurement: Measurement | null) {
  if (!measurement || measurement.kind === "skipped") return null;
  if (measurement.kind === "drawn") return measurement.polygons.length ? { polygons: measurement.polygons } : null;
  const area = areaOf(measurement);
  return area == null ? null : { areaSqft: area };
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
  neighborDiscountPercent = 0,
}: {
  slug: string;
  services: PublicService[];
  timeZone: string;
  currency: string;
  brandColor: string;
  acceptsPayments: boolean;
  googleEnabled: boolean;
  startDate: string;
  /** Percent off on days the business already works nearby; 0 when not offered. */
  neighborDiscountPercent?: number;
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
  const [location, setLocation] = useState<LatLng | null>(null);
  const [satellite, setSatellite] = useState<Record<MapZoom, string> | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [whereError, setWhereError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string[]>>>({});
  const [payment, setPayment] = useState<{ token: string; session: PaymentSession } | null>(null);
  const [loading, startLoading] = useTransition();
  const [locating, startLocating] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const chosen = services.filter((service) => selected.includes(service.id));
  const measuredServices = chosen.filter(isMeasured);
  const needsMeasure = measuredServices.length > 0;
  // The chosen services' questions, in the order the services were picked.
  const questions = questionsFor(services, selected);
  const areaSqft = needsMeasure ? areaOf(measurement) : null;
  const quote = quoteBooking(chosen, { areaSqft, neighborPercent: slot?.neighborDiscountPercent ?? 0, acceptsPayments });

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const item of slots ?? []) {
      const key = toDateKey(new Date(item.start), timeZone);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [slots, timeZone]);

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const neighborDays = days.filter((key) => slotsByDay.get(key)?.some((item) => item.neighborDiscountPercent > 0));
  const neighborPercent = Math.max(0, ...(slots ?? []).map((item) => item.neighborDiscountPercent));

  useEffect(() => {
    if (step !== "time" || selected.length === 0) return;
    startLoading(async () => {
      const result = await getAvailability({
        slug,
        serviceIds: selected,
        from: weekStart,
        days: 7,
        ...(location ? { location } : {}),
        ...(areaSqft ? { areaSqft } : {}),
      });
      if ("error" in result) {
        setSlotError(result.error);
        setSlots([]);
        return;
      }
      setSlotError(null);
      setSlots(result.slots);
      // Keep the chosen time if it's still open; its discount may have changed.
      setSlot((current) => (current ? (result.slots.find((item) => item.start === current.start) ?? null) : null));
      setDay((current) => {
        if (current && result.slots.some((item) => toDateKey(new Date(item.start), timeZone) === current)) return current;
        const firstNeighborDay = result.slots.find((item) => item.neighborDiscountPercent > 0);
        const first = firstNeighborDay ?? result.slots[0];
        return first ? toDateKey(new Date(first.start), timeZone) : null;
      });
    });
  }, [step, selected, slug, weekStart, timeZone, location, areaSqft]);

  function toggle(serviceId: string) {
    setSlot(null);
    setSelected((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]));
  }

  function go(next: Step) {
    setStep(next);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function changeAddress(value: AddressValue) {
    setAddress(value);
    setWhereError(null);
    // A new address means a new map, a new outline and possibly new neighbors.
    if (value.line1 !== address.line1 || value.postalCode !== address.postalCode || value.lat !== address.lat) {
      setLocation(null);
      setSatellite(null);
      setMeasurement((current) => (current?.kind === "drawn" ? null : current));
      setSlot(null);
    }
  }

  function confirmAddress() {
    setWhereError(null);
    setFieldErrors({});
    startLocating(async () => {
      const result = await locateAddress({ slug, address: { ...address }, wantsMap: needsMeasure });
      if (!result.ok) {
        setWhereError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setLocation(result.location);
      setSatellite(result.satellite);
      if (needsMeasure && !result.satellite && measurement?.kind === "drawn") setMeasurement(null);
      go(needsMeasure ? "measure" : "time");
    });
  }

  function book() {
    setSubmitError(null);
    setFieldErrors({});
    const problems = answerErrors(questions, answers);
    setQuestionErrors(problems);
    const firstProblem = questions.find((question) => problems[question.id]);
    if (firstProblem) {
      // Text boxes take focus; for choices, the first option does.
      document.querySelector<HTMLElement>(`#question-${firstProblem.id}, input[name="question-${firstProblem.id}"]`)?.focus();
      return;
    }
    startSubmit(async () => {
      const result = await submitBooking({
        slug,
        serviceIds: selected,
        start: slot!.start,
        customer,
        address: { ...address, lat: location?.lat ?? address.lat, lng: location?.lng ?? address.lng },
        notes,
        answers: answersToSend(questions, answers),
        measurement: needsMeasure ? measurementToSend(measurement) : null,
        company: honeypot,
      });
      if (!result.ok) {
        setSubmitError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        if (result.code === "slot_unavailable") {
          setSlot(null);
          go("time");
        } else if (result.code === "invalid_measurement") {
          setWhereError(result.error);
          go("measure");
        } else if (result.code === "outside_service_area") {
          setWhereError(result.error);
          go("where");
        }
        return;
      }
      if (result.payment) {
        setPayment({ token: result.token, session: result.payment });
        go("pay");
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
    { id: "where", label: "Where" },
    ...(needsMeasure ? [{ id: "measure" as Step, label: "Measure" }] : []),
    { id: "time", label: "Time" },
    { id: "details", label: "Details" },
    ...(quote.depositCents > 0 ? [{ id: "pay" as Step, label: "Deposit" }] : []),
  ];
  const stepIndex = steps.findIndex((item) => item.id === step);
  const addressLine = [address.line1, address.city].filter(Boolean).join(", ");
  const measuredReady = measurement?.kind === "skipped" || areaSqft != null;

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
                        {isMeasured(service) ? ` · ${formatCents(service.price_per_1000_sqft_cents!, currency)} per 1,000 sq ft` : ""}
                        {acceptsPayments && service.deposit_cents > 0 ? ` · ${formatCents(service.deposit_cents, currency)} deposit to book` : ""}
                      </span>
                      {isMeasured(service) ? (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                          <Ruler className="size-4" aria-hidden="true" />
                          Instant price: measure your yard on the map
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <StickyNext
            disabled={selected.length === 0}
            onNext={() => go("where")}
            summary={selected.length ? `${selected.length} selected · ${formatDuration(quote.minutes)}` : "Pick a service to continue"}
            brandColor={brandColor}
          />
        </section>
      ) : null}

      {step === "where" ? (
        <section aria-labelledby="where">
          <h2 id="where" className="text-2xl font-bold">
            Where should we come?
          </h2>
          <p className="mt-1 text-ink-soft">{chosen.map((service) => service.name).join(", ")}</p>
          {neighborDiscountPercent > 0 ? (
            <p className="mt-4 flex gap-2.5 rounded-[1.25rem] border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <Tag className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>Neighbor pricing:</strong> book a day we&apos;re already working near you and save {neighborDiscountPercent}%.
              </span>
            </p>
          ) : null}
          <form
            className="mt-6 space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              confirmAddress();
            }}
          >
            {whereError ? <FormMessage>{whereError}</FormMessage> : null}
            <AddressInput
              value={address}
              onChange={changeAddress}
              googleEnabled={googleEnabled}
              errors={{ line1: fieldErrors["address.line1"]?.[0] }}
            />
            <StepNav onBack={() => go("services")}>
              <button
                type="submit"
                disabled={locating || address.line1.trim().length < 3}
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-semibold disabled:opacity-40"
                style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
              >
                {locating ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Continue
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </StepNav>
          </form>
        </section>
      ) : null}

      {step === "measure" ? (
        <section aria-labelledby="measure">
          <h2 id="measure" className="text-2xl font-bold">
            Outline the area
          </h2>
          <p className="mt-1 text-ink-soft">
            {measuredServices.map((service) => service.name).join(", ")} is priced by size.{" "}
            {satellite && location ? "Trace it on the photo for an instant price." : "Enter the size for an instant price."}
          </p>
          {whereError ? <div className="mt-4"><FormMessage>{whereError}</FormMessage></div> : null}

          <div className="mt-5">
            {satellite && location && measurement?.kind !== "entered" ? (
              <>
                <MeasureMap
                  center={location}
                  links={satellite}
                  value={measurement?.kind === "drawn" ? measurement.polygons : []}
                  onChange={(polygons) => {
                    setWhereError(null);
                    setMeasurement({ kind: "drawn", polygons });
                  }}
                  brandColor={brandColor}
                />
                <button
                  type="button"
                  onClick={() => setMeasurement({ kind: "entered", text: "" })}
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline"
                >
                  Know the size? Enter it instead
                </button>
              </>
            ) : (
              <div className="max-w-sm space-y-3">
                <Field label="Area in square feet" htmlFor="area" hint={`Between ${MIN_AREA_SQFT.toLocaleString("en-US")} and ${MAX_AREA_SQFT.toLocaleString("en-US")} sq ft.`}>
                  <Input
                    id="area"
                    inputMode="numeric"
                    value={measurement?.kind === "entered" ? measurement.text : ""}
                    onChange={(event) => setMeasurement({ kind: "entered", text: event.target.value })}
                    placeholder="e.g. 6,000"
                  />
                </Field>
                {satellite && location ? (
                  <button
                    type="button"
                    onClick={() => setMeasurement(null)}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline"
                  >
                    Draw it on the map instead
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {areaSqft != null ? (
            <dl className="mt-5 space-y-2 rounded-[1.25rem] border border-line bg-card p-5 text-sm" aria-live="polite">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Your area</dt>
                <dd className="font-semibold">{formatSqft(areaSqft)}</dd>
              </div>
              {quote.lines
                .filter((line) => measuredServices.some((service) => service.id === line.id))
                .map((line) => (
                  <div key={line.id} className="flex justify-between gap-3">
                    <dt>{line.name}</dt>
                    <dd className="font-display text-lg font-bold">{formatCents(line.priceCents, currency)}</dd>
                  </div>
                ))}
            </dl>
          ) : null}

          <StepNav onBack={() => go("where")}>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setMeasurement({ kind: "skipped" });
                  go("time");
                }}
              >
                Skip, price it on site
              </Button>
              <StickyNext
                inline
                disabled={!measuredReady || measurement?.kind === "skipped"}
                onNext={() => go("time")}
                summary={areaSqft != null ? formatSqft(areaSqft) : "Outline the area"}
                brandColor={brandColor}
              />
            </div>
          </StepNav>
        </section>
      ) : null}

      {step === "time" ? (
        <section aria-labelledby="pick-time">
          <h2 id="pick-time" className="text-2xl font-bold">
            Pick a time
          </h2>
          <p className="mt-1 text-ink-soft">Times are in the business&apos;s local time zone.</p>

          {neighborDays.length ? (
            <p className="mt-4 flex gap-2.5 rounded-[1.25rem] border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700" data-testid="neighbor-banner">
              <Tag className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>We&apos;re already working near you</strong> on {neighborDays.map((key) => formatDateShort(key)).join(", ")}. Book one of those days and
                save {neighborPercent}%.
              </span>
            </p>
          ) : null}

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
              const isNeighborDay = neighborDays.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={isNeighborDay ? `${formatDateShort(key)}, save ${neighborPercent}%` : undefined}
                  disabled={count === 0}
                  onClick={() => setDay(key)}
                  className={cn(
                    "relative flex flex-col items-center rounded-xl border py-2 text-xs font-semibold transition-colors disabled:opacity-35",
                    isActive ? "border-transparent" : "border-line bg-card hover:border-ink-faint",
                  )}
                  style={isActive ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
                >
                  <span>{formatDateShort(key).split(",")[0]}</span>
                  <span className="font-display text-lg">{Number(dayOfMonth)}</span>
                  {isNeighborDay ? (
                    <span className="absolute -top-2 rounded-full bg-brand-600 px-1.5 text-[0.65rem] leading-4 text-white" aria-hidden="true">
                      −{neighborPercent}%
                    </span>
                  ) : null}
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

          <StepNav onBack={() => go(needsMeasure ? "measure" : "where")}>
            <StickyNext
              inline
              disabled={!slot}
              onNext={() => go("details")}
              summary={
                slot
                  ? `${formatDateShort(toDateKey(new Date(slot.start), timeZone))} at ${formatTime(slot.start, timeZone)}${slot.neighborDiscountPercent ? ` · ${slot.neighborDiscountPercent}% off` : ""}`
                  : "Pick a time"
              }
              brandColor={brandColor}
            />
          </StepNav>
        </section>
      ) : null}

      {step === "details" && slot ? (
        <section aria-labelledby="your-details">
          <h2 id="your-details" className="text-2xl font-bold">
            Your details
          </h2>
          <p className="mt-1 text-ink-soft">
            {chosen.map((service) => service.name).join(", ")} · {formatDateShort(toDateKey(new Date(slot.start), timeZone))} at{" "}
            {formatTime(slot.start, timeZone)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
            <MapPin className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
            <span>{addressLine}</span>
            <button type="button" onClick={() => go("where")} className="inline-flex min-h-9 items-center font-semibold text-brand-600 hover:underline">
              Change
            </button>
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

            <QuestionFields
              questions={questions}
              answers={answers}
              errors={questionErrors}
              onChange={(questionId, answer) => {
                setAnswers((current) => ({ ...current, [questionId]: answer }));
                setQuestionErrors((current) => {
                  const next = { ...current };
                  delete next[questionId];
                  return next;
                });
              }}
              brandColor={brandColor}
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
                {quote.lines.map((line) => {
                  const service = chosen.find((item) => item.id === line.id)!;
                  return (
                    <div key={line.id} className="flex justify-between gap-3">
                      <dt>
                        {line.name}
                        {isMeasured(service) && areaSqft != null ? <span className="text-ink-faint"> · {formatSqft(areaSqft)}</span> : null}
                      </dt>
                      <dd className="font-semibold">{linePriceText(line, service, currency)}</dd>
                    </div>
                  );
                })}
                {quote.discountCents > 0 ? (
                  <div className="flex justify-between gap-3 text-brand-700" data-testid="neighbor-discount">
                    <dt>Neighbor discount ({slot.neighborDiscountPercent}%)</dt>
                    <dd className="font-semibold">−{formatCents(quote.discountCents, currency)}</dd>
                  </div>
                ) : null}
                {quote.depositCents > 0 ? (
                  <div className="flex justify-between gap-3 border-t border-line pt-2">
                    <dt className="font-semibold">Deposit due now</dt>
                    <dd className="font-display text-lg font-bold">{formatCents(quote.depositCents, currency)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <StepNav onBack={() => go("time")}>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold disabled:opacity-60"
                style={{ backgroundColor: brandColor, color: brandTextColor(brandColor) }}
              >
                {submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="size-4" aria-hidden="true" />}
                {quote.depositCents > 0 ? "Continue to deposit" : "Book it"}
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
