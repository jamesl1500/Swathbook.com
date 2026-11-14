import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/libs/seo";

/** Visible questions and answers, published as FAQPage data too (the two always match). */
export function DirectoryFaq({ items, heading = "Booking on Swathbook" }: { items: Array<{ question: string; answer: string }>; heading?: string }) {
  return (
    <section aria-labelledby="directory-faq" className="mx-auto max-w-3xl">
      <JsonLd data={faqJsonLd(items)} />
      <h2 id="directory-faq" className="text-2xl font-extrabold">
        {heading}
      </h2>
      <dl className="mt-6 divide-y divide-line rounded-[1.5rem] border border-line bg-card">
        {items.map((item) => (
          <div key={item.question} className="p-5 sm:p-6">
            <dt className="font-bold">{item.question}</dt>
            <dd className="mt-1.5 leading-relaxed text-ink-soft">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
