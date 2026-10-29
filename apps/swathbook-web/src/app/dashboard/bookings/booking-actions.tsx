"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/libs/forms";
import { formatCents } from "@/libs/utils";
import { resolveCancellation, updateJobStatus } from "../schedule/actions";

function useRun(businessId: string) {
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
  return { pending, run };
}

/** Accept or decline a booking request (status "requested"). */
export function RequestControls({ businessId, bookingId, name }: { businessId: string; bookingId: string; name: string }) {
  const { pending, run } = useRun(businessId);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(updateJobStatus, { bookingId, status: "confirmed" })}>
        <Check className="size-4" aria-hidden="true" />
        Accept<span className="sr-only"> {name}&apos;s request</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Decline ${name}'s request? They'll get an email.`)) {
            run(updateJobStatus, { bookingId, status: "cancelled", reason: "The business couldn't take this booking" });
          }
        }}
      >
        <X className="size-4" aria-hidden="true" />
        Decline<span className="sr-only"> {name}&apos;s request</span>
      </Button>
    </div>
  );
}

/**
 * Answer a customer's cancellation request. Approving can refund what they
 * paid; the checkbox starts from the business's refund policy.
 */
export function CancelRequestControls({
  businessId,
  bookingId,
  name,
  paidCents,
  currency,
  refundByDefault,
  compact = false,
}: {
  businessId: string;
  bookingId: string;
  name: string;
  paidCents: number;
  currency: string;
  refundByDefault: boolean;
  compact?: boolean;
}) {
  const { pending, run } = useRun(businessId);
  const [refund, setRefund] = useState(refundByDefault);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  if (declining) {
    return (
      <div className="w-full space-y-2">
        <label htmlFor={`decline-note-${bookingId}`} className="block text-sm font-semibold">
          Note for {name} (optional)
        </label>
        <textarea
          id={`decline-note-${bookingId}`}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="We can move you to another day instead…"
          className="w-full rounded-xl border border-line-strong bg-card px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(resolveCancellation, { bookingId, approve: "0", note })}>
            Keep the booking
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setDeclining(false)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-3"}>
      {paidCents > 0 ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={refund} onChange={(event) => setRefund(event.target.checked)} className="size-5 accent-[var(--color-brand-600)]" />
          Refund {formatCents(paidCents, currency)}
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="danger"
          className="min-h-11"
          disabled={pending}
          onClick={() => run(resolveCancellation, { bookingId, approve: "1", ...(refund ? { refund: "on" } : {}) })}
        >
          <Check className="size-4" aria-hidden="true" />
          Approve cancellation<span className="sr-only"> for {name}</span>
        </Button>
        <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => setDeclining(true)}>
          Decline<span className="sr-only"> {name}&apos;s cancellation</span>
        </Button>
      </div>
    </div>
  );
}
