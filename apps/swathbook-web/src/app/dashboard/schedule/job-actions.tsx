"use client";

import { useActionState, useTransition } from "react";
import { Ban, CircleCheck, Play, RotateCcw, ThumbsUp, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import type { Database } from "@/libs/supabase/database.types";
import { assignBooking, refundPayment, rescheduleBooking, saveJobNotes, updateJobStatus } from "./actions";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

function useRunner(businessId: string) {
  const [pending, startTransition] = useTransition();
  function run(action: (formData: FormData) => Promise<FormState>, fields: Record<string, string>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const formData = new FormData();
    formData.set("businessId", businessId);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }
  return { pending, run };
}

export function StatusActions({
  businessId,
  bookingId,
  status,
  canManage,
  isAssignedToMe,
}: {
  businessId: string;
  bookingId: string;
  status: BookingStatus;
  canManage: boolean;
  isAssignedToMe: boolean;
}) {
  const { pending, run } = useRunner(businessId);
  const set = (next: BookingStatus, confirmText?: string, reason?: string) =>
    run(updateJobStatus, { bookingId, status: next, ...(reason ? { reason } : {}) }, confirmText);
  const canWork = canManage || isAssignedToMe;

  const buttons: React.ReactNode[] = [];
  if (canManage && (status === "requested" || status === "pending_payment")) {
    buttons.push(
      <Button key="confirm" onClick={() => set("confirmed")} disabled={pending}>
        <ThumbsUp className="size-4" aria-hidden="true" />
        {status === "pending_payment" ? "Confirm without deposit" : "Accept request"}
      </Button>,
    );
  }
  if (canWork && status === "confirmed") {
    buttons.push(
      <Button key="start" onClick={() => set("in_progress")} disabled={pending}>
        <Play className="size-4" aria-hidden="true" />
        Start job
      </Button>,
    );
  }
  if (canWork && (status === "confirmed" || status === "in_progress")) {
    buttons.push(
      <Button key="complete" variant={status === "in_progress" ? "primary" : "secondary"} onClick={() => set("completed")} disabled={pending}>
        <CircleCheck className="size-4" aria-hidden="true" />
        Mark complete
      </Button>,
    );
  }
  if (canWork && status === "confirmed") {
    buttons.push(
      <Button key="noshow" variant="ghost" onClick={() => set("no_show", "Mark this customer as a no-show?")} disabled={pending}>
        <UserX className="size-4" aria-hidden="true" />
        No-show
      </Button>,
    );
  }
  if (canManage && ["pending_payment", "requested", "confirmed", "in_progress"].includes(status)) {
    buttons.push(
      <Button
        key="cancel"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("Cancel this job? Add a reason for your records (optional):");
          if (reason !== null) set("cancelled", undefined, reason);
        }}
      >
        <Ban className="size-4" aria-hidden="true" />
        Cancel job
      </Button>,
    );
  }

  if (!buttons.length) return null;
  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}

export function RescheduleForm({
  businessId,
  bookingId,
  date,
  time,
  durationMinutes,
}: {
  businessId: string;
  bookingId: string;
  date: string;
  time: string;
  durationMinutes: number;
}) {
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await rescheduleBooking(prev, formData);
    if (result.success) toast.success(result.success);
    if (result.error && !result.fieldErrors) toast.error(result.error);
    return result;
  }, {});
  return (
    // Two columns at most: the card sits in a narrow column on desktop and on phones.
    <form action={formAction} className="grid grid-cols-2 gap-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field label="Date" htmlFor="reschedule-date" error={state.fieldErrors?.date?.[0]} className="col-span-2">
        <Input id="reschedule-date" name="date" type="date" defaultValue={date} required />
      </Field>
      <Field label="Start" htmlFor="reschedule-time" error={state.fieldErrors?.time?.[0]}>
        <Input id="reschedule-time" name="time" type="time" step={900} defaultValue={time} required />
      </Field>
      <Field label="Minutes" htmlFor="reschedule-duration" error={state.fieldErrors?.durationMinutes?.[0]}>
        <Input id="reschedule-duration" name="durationMinutes" type="number" min={5} max={1440} step={5} defaultValue={durationMinutes} />
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Saving…" className="col-span-2">
        Reschedule
      </SubmitButton>
    </form>
  );
}

export function AssignForm({
  businessId,
  bookingId,
  memberId,
  team,
}: {
  businessId: string;
  bookingId: string;
  memberId: string | null;
  team: Array<{ id: string; name: string }>;
}) {
  const { pending, run } = useRunner(businessId);
  return (
    <div>
      <label htmlFor="assign-member" className="text-sm font-semibold">
        Assigned to
      </label>
      <Select
        id="assign-member"
        className="mt-1.5"
        defaultValue={memberId ?? ""}
        disabled={pending}
        onChange={(event) => run(assignBooking, { bookingId, memberId: event.target.value })}
      >
        <option value="">Unassigned</option>
        {team.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function NotesForm({ businessId, bookingId, notes }: { businessId: string; bookingId: string; notes: string }) {
  const [, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveJobNotes(prev, formData);
    if (result.success) toast.success(result.success);
    if (result.error) toast.error(result.error);
    return result;
  }, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <label htmlFor="internal-notes" className="sr-only">
        Team notes
      </label>
      <textarea id="internal-notes" name="internalNotes" rows={4} maxLength={5000} defaultValue={notes} className={inputStyles} placeholder="Only your team sees these." />
      <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
        Save notes
      </SubmitButton>
    </form>
  );
}

export function RefundButton({ businessId, paymentId, label }: { businessId: string; paymentId: string; label: string }) {
  const { pending, run } = useRunner(businessId);
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(refundPayment, { paymentId }, `Refund ${label}? This can't be undone.`)}>
      <RotateCcw className="size-4" aria-hidden="true" />
      Refund
    </Button>
  );
}
