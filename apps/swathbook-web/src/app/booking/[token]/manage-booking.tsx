"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, LoaderCircle, XCircle } from "lucide-react";
import type { BookingOptions } from "@/libs/customer-booking";
import { addDays, formatDateShort, formatTime, toDateKey } from "@/libs/time";
import { brandOnLight, brandTextColor, cn } from "@/libs/utils";
import { cancelMyBooking, getRescheduleSlots, rescheduleMyBooking, type RescheduleSlot } from "./actions";

const DAYS_SHOWN = 14;

function policyText(options: BookingOptions, depositPaid: boolean) {
  if (!depositPaid) return null;
  switch (options.deposit_refund_policy) {
    case "refundable":
      return "Your deposit is refunded if the cancellation goes through.";
    case "refundable_before_window":
      return `Deposits are refunded for cancellations at least ${options.cancellation_window_hours} hours ahead.`;
    default:
      return "Deposits aren't refundable.";
  }
}

const BLOCKED: Record<string, string> = {
  too_late: "It's too close to your appointment to move it online.",
  limit: "This booking has already been moved the maximum number of times online.",
  not_offered: "This business doesn't take online reschedules.",
};

export function ManageBooking({
  token,
  options,
  timeZone,
  today,
  brandColor,
  businessName,
  contact,
  depositPaid,
}: {
  token: string;
  options: BookingOptions;
  timeZone: string;
  today: string;
  brandColor: string;
  businessName: string;
  contact: string | null;
  depositPaid: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // The page refreshes after a change, which can switch this panel to another
  // state; the confirmation stays visible through that.
  const notice = message ? (
    <p role={message.tone === "error" ? "alert" : "status"} className={cn("mt-3 rounded-xl px-4 py-3 text-sm", message.tone === "error" ? "bg-clay-soft text-clay-ink" : "bg-brand-50 text-brand-700")}>
      {message.text}
    </p>
  ) : null;

  if (options.cancel_requested_at) {
    return (
      <section className="rounded-[1.25rem] border border-line bg-card p-5" data-testid="manage-booking">
        <h2 className="font-bold">Cancellation requested</h2>
        {notice}
        <p className="mt-1 text-sm text-ink-soft">
          You asked to cancel on {formatDateShort(toDateKey(new Date(options.cancel_requested_at), timeZone))}. {businessName} will confirm by email.
        </p>
      </section>
    );
  }
  if (!options.can_reschedule && !options.can_cancel) {
    return notice ? (
      <section className="rounded-[1.25rem] border border-line bg-card p-5" data-testid="manage-booking">
        {notice}
      </section>
    ) : null;
  }

  const solid = { backgroundColor: brandColor, color: brandTextColor(brandColor) };
  const blocked = options.reschedule_blocked_reason ? BLOCKED[options.reschedule_blocked_reason] : null;

  return (
    <section className="rounded-[1.25rem] border border-line bg-card p-5" data-testid="manage-booking" aria-labelledby="manage-heading">
      <h2 id="manage-heading" className="font-bold">
        Need to make a change?
      </h2>
      {notice}

      {mode === "idle" ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {options.can_reschedule ? (
              <button type="button" onClick={() => setMode("reschedule")} className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold" style={solid}>
                <CalendarClock className="size-4" aria-hidden="true" />
                Reschedule
              </button>
            ) : null}
            {options.can_cancel ? (
              <button
                type="button"
                onClick={() => setMode("cancel")}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold text-ink hover:border-ink-soft"
              >
                <XCircle className="size-4" aria-hidden="true" />
                {options.cancel_is_request ? "Request to cancel" : "Cancel booking"}
              </button>
            ) : null}
          </div>
          {!options.can_reschedule && blocked ? (
            <p className="mt-3 text-sm text-ink-soft">
              {blocked} {contact ? `Contact ${businessName} at ${contact} to change the time.` : `Contact ${businessName} to change the time.`}
            </p>
          ) : null}
          {options.can_reschedule && options.reschedules_left < 3 ? (
            <p className="mt-3 text-sm text-ink-soft">
              You can move it online {options.reschedules_left} more {options.reschedules_left === 1 ? "time" : "times"}.
            </p>
          ) : null}
        </>
      ) : null}

      {mode === "reschedule" ? (
        <ReschedulePicker
          token={token}
          timeZone={timeZone}
          today={today}
          brandColor={brandColor}
          onCancel={() => setMode("idle")}
          onDone={(text) => {
            setMessage({ tone: "success", text });
            setMode("idle");
          }}
        />
      ) : null}

      {mode === "cancel" ? (
        <CancelForm
          token={token}
          isRequest={options.cancel_is_request}
          businessName={businessName}
          policy={policyText(options, depositPaid)}
          onCancel={() => setMode("idle")}
          onDone={(text, tone) => {
            setMessage({ tone, text });
            setMode("idle");
          }}
        />
      ) : null}
    </section>
  );
}

function ReschedulePicker({
  token,
  timeZone,
  today,
  brandColor,
  onCancel,
  onDone,
}: {
  token: string;
  timeZone: string;
  today: string;
  brandColor: string;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const days = Array.from({ length: DAYS_SHOWN }, (_, index) => addDays(today, index));
  const [day, setDay] = useState(today);
  // Loaded open times per day (or the error for that day); a missing key means loading.
  const [byDay, setByDay] = useState<Record<string, RescheduleSlot[] | { error: string }>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const solid = { backgroundColor: brandColor, color: brandTextColor(brandColor) };
  const loaded = byDay[day];
  const slots = loaded === undefined ? null : Array.isArray(loaded) ? loaded : [];
  const dayError = loaded && !Array.isArray(loaded) ? loaded.error : null;

  useEffect(() => {
    if (byDay[day] !== undefined) return;
    let current = true;
    getRescheduleSlots(token, day).then((result) => {
      if (current) setByDay((previous) => ({ ...previous, [day]: "error" in result ? { error: result.error } : result.slots }));
    });
    return () => {
      current = false;
    };
  }, [token, day, byDay]);

  function pickDay(key: string) {
    setDay(key);
    setChosen(null);
    setError(null);
  }

  return (
    <div className="mt-4 space-y-4">
      <div role="radiogroup" aria-label="Pick a day" data-allow-overflow className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {days.map((key) => {
          const active = key === day;
          const [, , dayOfMonth] = key.split("-");
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={formatDateShort(key)}
              onClick={() => pickDay(key)}
              className={cn("flex min-w-14 flex-col items-center rounded-xl border py-2 text-xs font-semibold", active ? "border-transparent" : "border-line bg-paper")}
              style={active ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
            >
              <span>{formatDateShort(key).split(",")[0]}</span>
              <span className="font-display text-lg">{Number(dayOfMonth)}</span>
            </button>
          );
        })}
      </div>

      {slots === null ? (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Finding open times…
        </p>
      ) : slots.length ? (
        <div role="radiogroup" aria-label="Pick a new time" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((slot) => {
            const active = chosen === slot.start;
            return (
              <button
                key={slot.start}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChosen(slot.start)}
                className={cn("min-h-11 rounded-xl border px-2 text-sm font-semibold", active ? "border-transparent" : "border-line bg-paper")}
                style={active ? solid : { color: brandOnLight(brandColor) }}
              >
                {formatTime(slot.start, timeZone)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">{dayError ?? "No open times that day. Try another."}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!chosen || saving}
          onClick={() =>
            chosen &&
            startSaving(async () => {
              const result = await rescheduleMyBooking(token, chosen);
              if ("error" in result) setError(result.error);
              else onDone(`Moved to ${formatDateShort(toDateKey(new Date(chosen), timeZone))} at ${formatTime(chosen, timeZone)}. We've emailed you the new time.`);
            })
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold disabled:opacity-50"
          style={solid}
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {chosen ? `Move to ${formatTime(chosen, timeZone)}, ${formatDateShort(toDateKey(new Date(chosen), timeZone))}` : "Pick a time"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 font-semibold text-ink-soft hover:text-ink">
          Keep my time
        </button>
      </div>
      {error && slots?.length ? (
        <p role="alert" className="text-sm text-clay-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CancelForm({
  token,
  isRequest,
  businessName,
  policy,
  onCancel,
  onDone,
}: {
  token: string;
  isRequest: boolean;
  businessName: string;
  policy: string | null;
  onCancel: () => void;
  onDone: (message: string, tone: "success" | "error") => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-ink-soft">
        {isRequest
          ? `${businessName} will review your request and email you.`
          : `${businessName} hasn't confirmed this request yet, so it's cancelled right away.`}{" "}
        {policy}
      </p>
      <label htmlFor="cancel-reason" className="block text-sm font-semibold">
        Reason (optional)
      </label>
      <textarea
        id="cancel-reason"
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Plans changed, found another time, …"
        className="w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelMyBooking(token, reason);
              if ("error" in result) onDone(result.error, "error");
              else
                onDone(
                  result.outcome === "requested" ? `Request sent. ${businessName} will confirm by email.` : "Your booking is cancelled. We've emailed you a confirmation.",
                  "success",
                );
            })
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-clay px-5 font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isRequest ? "Send cancellation request" : "Cancel booking"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 font-semibold text-ink-soft hover:text-ink">
          Never mind
        </button>
      </div>
    </div>
  );
}
