import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd, pageMetadata, softwareJsonLd } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { PaymentFeeCards } from "@/components/marketing/payment-fee-cards";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { TalkToUsCard } from "@/components/marketing/talk-to-us";
import { PlanIncludesAside } from "@/components/marketing/hero-asides";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Simple monthly plans for solo operators and growing crews, plus 1.25% of customer payments. Booking link, deposits and AI routing included. 7-day free trial.",
  path: routes.pricing,
});

const pricingFaqs = [
  {
    question: "Is there a free trial?",
    answer: "Yes. Every new business gets a 7-day free trial with everything turned on, and you don't need a credit card. Pick a plan any time; you won't be charged until the trial ends.",
  },
  {
    question: "Is there a fee on payments?",
    answer: "Yes: Swathbook takes 1.25% of each deposit and balance customers pay through your booking page. It comes out before the payout, a refund returns it, and tips are yours in full. Jobs paid in cash have no fee.",
  },
  {
    question: "Are there payment processing fees?",
    answer: "Yes, card payments also carry Stripe's standard processing fee (2.9% + 30¢ on most US cards), paid to Stripe. Each service in your dashboard shows what you keep after both.",
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
        description="Pick the plan that matches the size of your operation, plus 1.25% of the payments you take. Every plan includes your booking link, deposits, payments and AI routing."
        aside={<PlanIncludesAside />}
      />

      <section className="py-24" aria-labelledby="plans-heading">
        <Container>
          <h2 id="plans-heading" className="sr-only">
            Plans
          </h2>
          <PricingCards />
          <p className="mt-8 text-center text-sm text-ink-faint">Prices in USD, billed monthly after your 7-day free trial.</p>
        </Container>
      </section>

      <section className="pb-24" aria-labelledby="fee-heading">
        <Container>
          <h2 id="fee-heading" className="mb-8 text-center text-2xl font-bold sm:text-3xl">
            And when your customers pay
          </h2>
          <PaymentFeeCards />
        </Container>
      </section>

      <section className="border-t border-line bg-paper-deep/50 pb-8 pt-24">
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
