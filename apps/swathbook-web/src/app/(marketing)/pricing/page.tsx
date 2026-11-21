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
    "No monthly fee. Swathbook takes 1.25% of the payments you take through your booking link, with deposits, card payments, AI routing and unlimited team members included.",
  path: routes.pricing,
});

const pricingFaqs = [
  {
    question: "Is there a monthly fee?",
    answer: "No. There's no subscription, no setup fee and no contract. Swathbook takes 1.25% of each deposit and balance your customers pay through your booking link, and that's all.",
  },
  {
    question: "When is the 1.25% taken?",
    answer: "Only when you're paid. It comes out of each card payment before it reaches your bank, so there's never a bill. Jobs paid in cash cost nothing, and tips go to you in full.",
  },
  {
    question: "Are there payment processing fees?",
    answer: "Yes, card payments carry Stripe's standard processing fee (2.9% + 30¢ on most US cards), paid to Stripe. Each service in your dashboard shows what you keep after both.",
  },
  {
    question: "What if I refund a customer?",
    answer: "Our fee is refunded with it. If you don't keep the money, we don't either.",
  },
  {
    question: "Is anything limited?",
    answer: "No. Every business gets every feature, unlimited bookings and as many team members as it needs. A solo operator and a ten-truck fleet pay the same rate.",
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd data={[softwareJsonLd, faqJsonLd(pricingFaqs)]} />
      <PageHero
        eyebrow="Pricing"
        title="You get paid. Then we do."
        description="No monthly fee, no tiers, no contract. Swathbook takes 1.25% of the payments you take through it, and every feature comes with it."
        aside={<PlanIncludesAside />}
      />

      <section className="py-24" aria-labelledby="plans-heading">
        <Container>
          <h2 id="plans-heading" className="sr-only">
            Price
          </h2>
          <PricingCards />
          <p className="mt-8 text-center text-sm text-ink-faint">
            Prices in USD. Card processing is charged separately by Stripe.
          </p>
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
