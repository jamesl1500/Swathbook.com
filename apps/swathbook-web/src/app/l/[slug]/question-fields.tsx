"use client";

import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/field";
import { MAX_ANSWER_LENGTH, type ServiceQuestion } from "@/libs/service-questions";
import { brandTextColor, cn } from "@/libs/utils";

type Question = ServiceQuestion & { serviceName: string };

/**
 * The chosen services' questions ("Make and model?"), grouped by service.
 * Free-text questions get a text box; choice questions a row of options.
 */
export function QuestionFields({
  questions,
  answers,
  errors,
  onChange,
  brandColor,
}: {
  questions: Question[];
  answers: Record<string, string>;
  errors: Record<string, string>;
  onChange: (questionId: string, answer: string) => void;
  brandColor: string;
}) {
  if (!questions.length) return null;
  const groups = [...new Set(questions.map((question) => question.serviceName))];

  return (
    <div className="space-y-5 rounded-[1.25rem] border border-line bg-card p-5" data-testid="booking-questions">
      <div>
        <h3 className="font-bold">A few questions</h3>
        <p className="text-sm text-ink-soft">So they arrive ready for the job.</p>
      </div>
      {groups.map((serviceName) => (
        <div key={serviceName} className="space-y-4">
          {groups.length > 1 ? <p className="label-tag text-ink-faint">{serviceName}</p> : null}
          {questions
            .filter((question) => question.serviceName === serviceName)
            .map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id] ?? ""}
                error={errors[question.id]}
                onChange={(answer) => onChange(question.id, answer)}
                brandColor={brandColor}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function QuestionField({
  question,
  value,
  error,
  onChange,
  brandColor,
}: {
  question: Question;
  value: string;
  error?: string;
  onChange: (answer: string) => void;
  brandColor: string;
}) {
  const id = `question-${question.id}`;
  const label = (
    <>
      {question.prompt}
      {question.required ? null : <span className="font-normal text-ink-faint"> (optional)</span>}
    </>
  );
  const errorText = error ? (
    <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-sm text-clay" role="alert">
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      {error}
    </p>
  ) : null;

  if (question.kind === "choice") {
    return (
      <fieldset aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined}>
        <legend className="text-sm font-semibold">{label}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {question.options.map((option) => {
            const selected = value === option;
            return (
              <label
                key={option}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition-colors has-focus-visible:ring-3 has-focus-visible:ring-brand-200",
                  selected ? "border-transparent" : "border-line-strong bg-card hover:border-ink-soft",
                )}
                style={selected ? { backgroundColor: brandColor, color: brandTextColor(brandColor) } : undefined}
              >
                <input
                  type="radio"
                  name={id}
                  value={option}
                  checked={selected}
                  onChange={() => onChange(option)}
                  className="sr-only"
                />
                {option}
              </label>
            );
          })}
        </div>
        {errorText}
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        maxLength={MAX_ANSWER_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        required={question.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {errorText}
    </div>
  );
}
