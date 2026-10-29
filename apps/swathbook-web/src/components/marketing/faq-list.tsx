import { Plus } from "lucide-react";
import { faqs } from "@/libs/marketing/content";

/**
 * FAQ accordion built on <details>, so it works without JavaScript.
 */
export function FaqList({ items = faqs }: { items?: Array<{ question: string; answer: string }> }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.question} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 font-display text-lg font-semibold [&::-webkit-details-marker]:hidden">
            {item.question}
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong transition-transform duration-300 group-open:rotate-45 group-open:border-brand-500 group-open:bg-brand-600 group-open:text-paper">
              <Plus className="size-4" aria-hidden="true" />
            </span>
          </summary>
          <p className="max-w-2xl pb-5 leading-relaxed text-ink-soft">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
