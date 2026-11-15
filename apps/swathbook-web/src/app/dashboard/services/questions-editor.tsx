"use client";

import { useState } from "react";
import { MessageCircleQuestion, Plus, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Select } from "@/components/ui/field";
import { MAX_OPTIONS, MAX_QUESTIONS_PER_SERVICE, type QuestionKind } from "@/libs/service-questions";

export type SavedQuestion = { id: string; prompt: string; kind: QuestionKind; options: string[]; is_required: boolean; sort_order: number };

type Draft = { key: string; id?: string; prompt: string; kind: QuestionKind; options: string[]; required: boolean };

function newKey() {
  return crypto.randomUUID();
}

function toDrafts(saved: SavedQuestion[]): Draft[] {
  return [...saved]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((question) => ({ key: question.id, id: question.id, prompt: question.prompt, kind: question.kind, options: question.options, required: question.is_required }));
}

/**
 * The questions customers answer when they book this service, e.g. "Make and
 * model?" or "What kind of car?" (Sedan / SUV / Truck). Submitted with the
 * service form as one JSON field.
 */
export function QuestionsEditor({ idPrefix, initial = [], error }: { idPrefix: string; initial?: SavedQuestion[]; error?: string }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(initial));
  const update = (key: string, change: Partial<Draft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  const payload = drafts.map(({ id, prompt, kind, options, required }) => ({ ...(id ? { id } : {}), prompt, kind, options, required }));

  return (
    <fieldset className="space-y-3" aria-describedby={error ? `${idPrefix}-questions-error` : undefined}>
      <legend className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircleQuestion className="size-4 text-ink-faint" aria-hidden="true" />
        Questions for customers
      </legend>
      <p className="-mt-1 text-sm text-ink-soft">Asked when someone books this service, so you show up ready. For example: &ldquo;Make and model?&rdquo;</p>
      <input type="hidden" name="questions" value={JSON.stringify(payload)} />

      {drafts.map((draft, index) => {
        const id = (name: string) => `${idPrefix}-q${index}-${name}`;
        return (
          <div key={draft.key} className="space-y-3 rounded-xl border border-line bg-paper p-3" data-testid="question-draft">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={id("prompt")} className="sr-only">
                  Question {index + 1}
                </label>
                <Input
                  id={id("prompt")}
                  value={draft.prompt}
                  maxLength={200}
                  placeholder={index === 0 ? "e.g. Make and model?" : "Your question"}
                  onChange={(event) => update(draft.key, { prompt: event.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
                aria-label={`Remove question ${index + 1}`}
                title="Remove question"
                className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-clay-soft hover:text-clay"
              >
                <Trash className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor={id("kind")} className="sr-only">
                Answer type for question {index + 1}
              </label>
              <Select
                id={id("kind")}
                value={draft.kind}
                className="w-auto"
                onChange={(event) => {
                  const kind = event.target.value as QuestionKind;
                  update(draft.key, { kind, options: kind === "choice" && draft.options.length === 0 ? ["", ""] : draft.options });
                }}
              >
                <option value="text">Written answer</option>
                <option value="choice">Pick one option</option>
              </Select>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(event) => update(draft.key, { required: event.target.checked })}
                  className="size-4 accent-[var(--color-brand-600)]"
                />
                Required
              </label>
            </div>

            {draft.kind === "choice" ? (
              <div className="space-y-2">
                {draft.options.map((option, optionIndex) => (
                  // Options have no ids of their own; position is stable while editing one question.
                  <div key={optionIndex} className="flex items-center gap-2">
                    <label htmlFor={id(`option${optionIndex}`)} className="sr-only">
                      Option {optionIndex + 1} for question {index + 1}
                    </label>
                    <Input
                      id={id(`option${optionIndex}`)}
                      value={option}
                      maxLength={80}
                      placeholder={["e.g. Sedan", "e.g. SUV", "e.g. Truck"][optionIndex] ?? `Option ${optionIndex + 1}`}
                      onChange={(event) =>
                        update(draft.key, { options: draft.options.map((value, position) => (position === optionIndex ? event.target.value : value)) })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => update(draft.key, { options: draft.options.filter((_, position) => position !== optionIndex) })}
                      aria-label={`Remove option ${optionIndex + 1}`}
                      className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-paper-deep hover:text-ink"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {draft.options.length < MAX_OPTIONS ? (
                  <Button variant="ghost" size="sm" onClick={() => update(draft.key, { options: [...draft.options, ""] })}>
                    <Plus className="size-4" aria-hidden="true" />
                    Add option
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <FieldError id={`${idPrefix}-questions-error`} message={error} />

      {drafts.length < MAX_QUESTIONS_PER_SERVICE ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDrafts((current) => [...current, { key: newKey(), prompt: "", kind: "text", options: [], required: true }])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a question
        </Button>
      ) : (
        <p className="text-sm text-ink-faint">That&apos;s the most questions one service can ask.</p>
      )}
    </fieldset>
  );
}
