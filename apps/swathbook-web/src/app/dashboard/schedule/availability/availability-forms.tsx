"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldError, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { cn } from "@/libs/utils";
import { addTimeOff, deleteTimeOff, saveBookingRules, saveHours } from "../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function withToast(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  return async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) toast.success(result.success);
    return result;
  };
}

export function HoursForm({ businessId, hours }: { businessId: string; hours: Array<{ weekday: number; opens_at: string; closes_at: string }> }) {
  const [state, formAction] = useActionState(withToast(saveHours), {});
  const [open, setOpen] = useState(() => DAYS.map((_, weekday) => hours.some((hour) => hour.weekday === weekday)));

  return (
    <form action={formAction} className="space-y-2" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {DAYS.map((day, weekday) => {
        const row = hours.find((hour) => hour.weekday === weekday);
        const error = state.fieldErrors?.[`day-${weekday}`]?.[0];
        return (
          <div key={day}>
            <div className={cn("grid items-center gap-2 rounded-xl px-3 py-2 sm:grid-cols-[8.5rem_1fr] sm:gap-3", open[weekday] && "bg-paper")}>
              <label className="flex min-h-10 items-center gap-2.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  name={`open-${weekday}`}
                  checked={open[weekday]}
                  onChange={(event) => setOpen((current) => current.map((value, index) => (index === weekday ? event.target.checked : value)))}
                  className="size-5 accent-[var(--color-brand-600)]"
                />
                {day}
              </label>
              {open[weekday] ? (
                <div className="flex min-w-0 items-center gap-2">
                  <label className="sr-only" htmlFor={`opens-${weekday}`}>
                    {day} opens
                  </label>
                  <Input id={`opens-${weekday}`} name={`opens-${weekday}`} type="time" step={900} defaultValue={row?.opens_at.slice(0, 5) ?? "08:00"} className="min-w-0 flex-1 py-1.5" />
                  <span className="shrink-0 text-ink-faint">to</span>
                  <label className="sr-only" htmlFor={`closes-${weekday}`}>
                    {day} closes
                  </label>
                  <Input id={`closes-${weekday}`} name={`closes-${weekday}`} type="time" step={900} defaultValue={row?.closes_at.slice(0, 5) ?? "17:00"} className="min-w-0 flex-1 py-1.5" />
                </div>
              ) : (
                <span className="text-sm text-ink-faint">Closed</span>
              )}
            </div>
            <FieldError message={error} />
          </div>
        );
      })}
      <div className="pt-2">
        <SubmitButton pendingLabel="Saving…">Save hours</SubmitButton>
      </div>
    </form>
  );
}

type Rules = {
  booking_lead_time_minutes: number;
  booking_window_days: number;
  slot_interval_minutes: number;
  buffer_minutes: number;
  arrival_window_minutes: number;
  cancellation_window_hours: number;
  deposit_refund_policy: string;
  auto_confirm: boolean;
  allow_customer_reschedule: boolean;
};

export function RulesForm({ businessId, rules }: { businessId: string; rules: Rules }) {
  const [state, formAction] = useActionState(withToast(saveBookingRules), {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum notice" htmlFor="lead" hint="How soon customers can book" error={errors.bookingLeadTimeMinutes?.[0]}>
          <Select id="lead" name="bookingLeadTimeMinutes" defaultValue={rules.booking_lead_time_minutes}>
            {[0, 60, 120, 240, 720, 1440, 2880, 4320, 10080].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? "No minimum" : minutes < 1440 ? `${minutes / 60} hours` : `${minutes / 1440} days`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Book up to" htmlFor="window" hint="How far ahead the calendar opens" error={errors.bookingWindowDays?.[0]}>
          <Select id="window" name="bookingWindowDays" defaultValue={rules.booking_window_days}>
            {[7, 14, 30, 60, 90, 180, 365].map((days) => (
              <option key={days} value={days}>
                {days} days ahead
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start times every" htmlFor="interval" error={errors.slotIntervalMinutes?.[0]}>
          <Select id="interval" name="slotIntervalMinutes" defaultValue={rules.slot_interval_minutes}>
            {[15, 30, 45, 60, 90, 120].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gap between jobs" htmlFor="buffer" hint="Drive and setup time" error={errors.bufferMinutes?.[0]}>
          <Select id="buffer" name="bufferMinutes" defaultValue={rules.buffer_minutes}>
            {[0, 10, 15, 20, 30, 45, 60, 90].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes ? `${minutes} minutes` : "None"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Arrival window" htmlFor="arrival" hint="How far routes may shift an arrival" error={errors.arrivalWindowMinutes?.[0]}>
          <Select id="arrival" name="arrivalWindowMinutes" defaultValue={rules.arrival_window_minutes}>
            {[0, 15, 30, 60, 90, 120, 180, 240].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes ? `± ${minutes} minutes` : "Exact times only"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cancellation notice" htmlFor="cancel" error={errors.cancellationWindowHours?.[0]}>
          <Select id="cancel" name="cancellationWindowHours" defaultValue={rules.cancellation_window_hours}>
            {[0, 12, 24, 48, 72, 168].map((hours) => (
              <option key={hours} value={hours}>
                {hours ? `${hours} hours` : "Anytime"}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Deposits when a customer cancels" htmlFor="refund">
        <Select id="refund" name="depositRefundPolicy" defaultValue={rules.deposit_refund_policy}>
          <option value="refundable_before_window">Refund if they cancel with enough notice</option>
          <option value="refundable">Always refund</option>
          <option value="non_refundable">Keep the deposit</option>
        </Select>
      </Field>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="autoConfirm" defaultChecked={rules.auto_confirm} className="mt-0.5 size-4 accent-[var(--color-brand-600)]" />
        <span>
          <strong>Confirm bookings automatically.</strong> Turn off to review each request before it&apos;s confirmed.
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="allowCustomerReschedule"
          defaultChecked={rules.allow_customer_reschedule}
          className="mt-0.5 size-4 accent-[var(--color-brand-600)]"
        />
        <span>
          <strong>Let customers reschedule online.</strong> They can move to another open time from their booking link, up to 3 times and not inside
          your cancellation window. Cancellations always come to you as a request.
        </span>
      </label>
      <SubmitButton pendingLabel="Saving…">Save rules</SubmitButton>
    </form>
  );
}

export function TimeOffForm({ businessId, team, defaultDate }: { businessId: string; team: Array<{ id: string; name: string }>; defaultDate: string }) {
  const [state, formAction] = useActionState(withToast(addTimeOff), {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From" htmlFor="startDate" error={errors.startDate?.[0]}>
          <Input id="startDate" name="startDate" type="date" defaultValue={defaultDate} required />
        </Field>
        <Field label="Through" htmlFor="endDate" error={errors.endDate?.[0]}>
          <Input id="endDate" name="endDate" type="date" defaultValue={defaultDate} required />
        </Field>
      </div>
      <Field label="Who's off" htmlFor="memberId">
        <Select id="memberId" name="memberId" defaultValue="">
          <option value="">Whole business (closed)</option>
          {team.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={<>Reason <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor="reason">
        <Input id="reason" name="reason" maxLength={200} placeholder="Holiday, equipment repair, vacation" />
      </Field>
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add time off
      </SubmitButton>
    </form>
  );
}

export function TimeOffList({ businessId, entries }: { businessId: string; entries: Array<{ id: string; label: string; who: string; reason: string | null }> }) {
  const [pending, startTransition] = useTransition();
  if (!entries.length) return <p className="text-sm text-ink-soft">No upcoming time off.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
          <span>
            <span className="font-semibold">{entry.label}</span>
            <span className="text-ink-soft"> · {entry.who}</span>
            {entry.reason ? <span className="block text-ink-faint">{entry.reason}</span> : null}
          </span>
          <button
            type="button"
            disabled={pending}
            aria-label={`Remove time off ${entry.label}`}
            onClick={() =>
              startTransition(async () => {
                const formData = new FormData();
                formData.set("businessId", businessId);
                formData.set("timeOffId", entry.id);
                const result = await deleteTimeOff(formData);
                if (result.error) toast.error(result.error);
                else toast.success(result.success);
              })
            }
            className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-clay-soft hover:text-clay"
          >
            <Trash className="size-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
