"use client";

import { useActionState } from "react";
import { Select, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { INVESTOR_STATUSES, INVESTOR_STATUS_LABELS, type InvestorStatus } from "@/libs/investors";
import { cn } from "@/libs/utils";
import { updateInvestor } from "./actions";

/** Where the conversation stands, and notes only staff see. */
export function FollowUpForm({ id, status, notes }: { id: string; status: InvestorStatus; notes: string | null }) {
  const [state, formAction] = useActionState(updateInvestor, {});

  return (
    <form action={formAction} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-start">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="sr-only">Status</span>
        <Select name="status" defaultValue={status} aria-label="Status">
          {INVESTOR_STATUSES.map((value) => (
            <option key={value} value={value}>
              {INVESTOR_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="sr-only">Notes</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={4000}
          defaultValue={notes ?? ""}
          placeholder="Private notes (calls, next steps)"
          aria-label="Notes"
          className={cn(inputStyles, "resize-y")}
        />
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <span role="status" className={cn("text-sm", state.error ? "text-clay" : "text-brand-600")}>
          {state.error ?? state.success ?? ""}
        </span>
      </div>
    </form>
  );
}
