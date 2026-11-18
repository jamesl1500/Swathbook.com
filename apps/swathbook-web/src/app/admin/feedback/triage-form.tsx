"use client";

import { useActionState } from "react";
import { Select, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FEEDBACK_STATUSES, TEAM_STATUS_LABELS, type FeedbackStatus } from "@/libs/feedback";
import { cn } from "@/libs/utils";
import { updateFeedbackNote } from "./actions";

/** Status and an optional reply the sender will see under "Your feedback". */
export function TriageForm({ id, status, response }: { id: string; status: FeedbackStatus; response: string | null }) {
  const [state, formAction] = useActionState(updateFeedbackNote, {});

  return (
    <form action={formAction} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-start">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="sr-only">Status</span>
        <Select name="status" defaultValue={status} aria-label="Status">
          {FEEDBACK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {TEAM_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="sr-only">Reply to the sender</span>
        <textarea
          name="response"
          rows={2}
          maxLength={2000}
          defaultValue={response ?? ""}
          placeholder="Reply they'll see in the app (optional)"
          aria-label="Reply to the sender"
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
