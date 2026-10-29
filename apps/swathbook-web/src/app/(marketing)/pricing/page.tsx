import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd, pageMetadata, softwareJsonLd } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { TalkToUsCard } from "@/components/marketing/talk-to-us";
import { PlanIncludesAside } from "@/components/marketing/hero-asides";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Simple monthly plans for solo operators and growing crews, with booking link, deposits, card payments and AI routing included. Start free, no contracts.",
  path: routes.pricing,
});

const pricingFaqs = [
  {
    question: "Is there a free trial?",
    answer: "Yes. Every new business gets 14 days free with everything turned on, and you don't need a credit card. Pick a plan any time; you won't be charged until the trial ends.",
  },
  {
    question: "Are there payment processing fees?",
    answer: "Card payments carry a standard processing fee from our payment partner, shown clearly before you go live. Swathbook doesn't add a hidden markup.",
  },
  {
    question: "Can I switch plans later?",
    answer: "Anytime. Upgrade when you add a crew member, or drop down in the off-season. Changes take effect on your next bill.",
  },
  {
    question: "What happens if I cancel?",
    answer: "Your link stops taking new bookings at the end of your billing period. Your account, customers and job history stay put, so you can pick up where you left off.",
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd data={[softwareJsonLd, faqJsonLd(pricingFaqs)]} />
      <PageHero
        eyebrow="Pricing"
        title="Priced like a tool, not a tax."
        description="Pick the plan that matches the size of your operation. Every plan includes your booking link, deposits, payments and AI routing."
        aside={<PlanIncludesAside />}
      />

      <section className="py-24" aria-labelledby="plans-heading">
        <Container>
          <h2 id="plans-heading" className="sr-only">
            Plans
          </h2>
          <PricingCards />
          <p className="mt-8 text-center text-sm text-ink-faint">
            Prices in USD. Card processing fees apply to customer payments.
          </p>
        </Container>
      </section>

      <section className="border-t border-line bg-paper-deep/50 pb-8 pt-24">
        <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading eyebrow="Billing questions" title="The fine print, in plain English" />
            <TalkToUsCard className="mt-8" />
          </div>
          <FaqList items={pricingFaqs} />
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
