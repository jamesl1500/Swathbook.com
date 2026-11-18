"use client";

import { useActionState, useState } from "react";
import { Bug, Heart, Lightbulb, MessageCircle, type LucideIcon } from "lucide-react";
import { sendFeedback } from "@/app/actions/feedback";
import { Field, FieldError, FormMessage, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FEEDBACK_KINDS, MESSAGE_MAX, RATING_LABELS, type FeedbackKind } from "@/libs/feedback";
import type { FormState } from "@/libs/forms";
import { cn } from "@/libs/utils";

const KIND_ICONS: Record<FeedbackKind, LucideIcon> = { idea: Lightbulb, problem: Bug, praise: Heart, other: MessageCircle };

const PLACEHOLDERS: Record<FeedbackKind, string> = {
  idea: "What would make Swathbook more useful to you?",
  problem: "What happened, and what did you expect? The page you were on is included for us.",
  praise: "What's working well? We'll make sure to keep it.",
  other: "What's on your mind?",
};

/**
 * The feedback form on the website. `page` is where the person came from
 * (so a bug report says where it happened); `businessId` ties a dashboard
 * note to the business that was open.
 */
export function FeedbackForm({ page, businessId, defaultKind = "idea" }: { page?: string | null; businessId?: string | null; defaultKind?: FeedbackKind }) {
  // A fresh, empty form after each note that goes through.
  const [round, setRound] = useState(0);
  const [state, formAction] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await sendFeedback(previous, formData);
    if (result.success) setRound((value) => value + 1);
    return result;
  }, {});

  return (
    <div className="space-y-4">
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <FeedbackFields key={round} formAction={formAction} state={state} page={page} businessId={businessId} defaultKind={defaultKind} />
    </div>
  );
}

function FeedbackFields({
  formAction,
  state,
  page,
  businessId,
  defaultKind,
}: {
  formAction: (formData: FormData) => void;
  state: FormState;
  page?: string | null;
  businessId?: string | null;
  defaultKind: FeedbackKind;
}) {
  const [kind, setKind] = useState<FeedbackKind>(defaultKind);
  const [length, setLength] = useState(0);
  const errors = state.success ? {} : (state.fieldErrors ?? {});

  return (
    <form action={formAction} className="space-y-6" data-testid="feedback-form">
      {page ? <input type="hidden" name="page" value={page} /> : null}
      {businessId ? <input type="hidden" name="businessId" value={businessId} /> : null}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">What kind of feedback?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEEDBACK_KINDS.map((option) => {
            const Icon = KIND_ICONS[option.value];
            const checked = kind === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-brand-200",
                  checked ? "border-brand-500 bg-brand-50" : "border-line-strong bg-card hover:border-ink-faint",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={checked}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                <Icon className={cn("size-5 shrink-0", checked ? "text-brand-600" : "text-ink-faint")} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-sm text-ink-soft">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <FieldError message={errors.kind?.[0]} />
      </fieldset>

      <Field label="Your feedback" htmlFor="feedback-message" error={errors.message?.[0]} hint={`${length.toLocaleString("en-US")} / ${MESSAGE_MAX.toLocaleString("en-US")}`}>
        <textarea
          id="feedback-message"
          name="message"
          rows={6}
          maxLength={MESSAGE_MAX}
          required
          placeholder={PLACEHOLDERS[kind]}
          onChange={(event) => setLength(event.target.value.length)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "feedback-message-error" : undefined}
          className={cn(inputStyles, "resize-y leading-relaxed")}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">
          How&apos;s Swathbook working for you so far? <span className="font-normal text-ink-faint">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              title={RATING_LABELS[value]}
              className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-card px-3 font-semibold has-checked:border-brand-500 has-checked:bg-brand-600 has-checked:text-paper has-focus-visible:ring-3 has-focus-visible:ring-brand-200"
            >
              <input type="radio" name="rating" value={value} className="sr-only" aria-label={`${value} of 5: ${RATING_LABELS[value]}`} />
              {value}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-ink-faint">1 is &ldquo;not working for me&rdquo;, 5 is &ldquo;love it&rdquo;.</p>
      </fieldset>

      <label className="flex items-start gap-3 text-[0.95rem]">
        <input type="checkbox" name="contactOk" defaultChecked className="mt-1 size-4 accent-brand-600" />
        <span>
          You can email me about this
          <span className="block text-sm text-ink-soft">We might ask a follow-up question, or tell you when it&apos;s fixed.</span>
        </span>
      </label>

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <SubmitButton pendingLabel="Sending…">Send feedback</SubmitButton>
    </form>
  );
}
