import type { BookingAnswer } from "@/libs/service-questions";
import { cn } from "@/libs/utils";

/** In the order the customer answered: by service, then question. */
export function sortAnswers<T extends { sort_order: number }>(answers: T[] | null | undefined) {
  return [...(answers ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * What the customer said when booking ("Make and model?" Honda Civic). The
 * service name shows only when the booking covers more than one service.
 */
export function BookingAnswers({ answers, className }: { answers: BookingAnswer[]; className?: string }) {
  if (!answers.length) return null;
  const multipleServices = new Set(answers.map((answer) => answer.service_name)).size > 1;
  return (
    <dl className={cn("space-y-3 text-sm", className)} data-testid="booking-answers">
      {answers.map((answer, index) => (
        // Prompts can repeat across services, so the position keeps keys unique.
        <div key={`${index}-${answer.prompt}`}>
          <dt className="text-ink-soft">
            {answer.prompt}
            {multipleServices ? <span className="text-ink-faint"> · {answer.service_name}</span> : null}
          </dt>
          <dd className="mt-0.5 font-semibold whitespace-pre-line wrap-break-word">{answer.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
