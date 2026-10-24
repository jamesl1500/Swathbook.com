import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Link2,
  Route,
  Wallet,
  X,
} from "lucide-react";
import { ClaimLinkForm } from "@/components/marketing/claim-link-form";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { TalkToUsCard } from "@/components/marketing/talk-to-us";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { PillarVisual } from "@/components/marketing/pillar-visual";
import { Container, Eyebrow, SectionHeading } from "@/components/marketing/section";
import { TradeMarquee } from "@/components/marketing/trade-marquee";
import { siteConfig } from "@/libs/globals/site";
import { patchwork, pillars, supportingFeatures, trades } from "@/libs/marketing/content";
import { routes } from "@/libs/routes";
import { faqJsonLd, softwareJsonLd } from "@/libs/seo";
import { formatPrice } from "@/libs/utils";
import { JsonLd } from "@/components/seo/json-ld";

const steps = [
  {
    icon: Link2,
    title: "Set up your link",
    body: "Pick your trade, add your services and prices, and set your hours. We suggest a starter menu so you're not staring at a blank page.",
  },
  {
    icon: Wallet,
    title: "Customers book & pay a deposit",
    body: "Share your link anywhere. Customers choose a service and an open time and pay the deposit, all without a phone call.",
  },
  {
    icon: Route,
    title: "Drive the smartest route",
    body: "Each morning your stops are lined up in the order that saves the most road. Finish the job, send the bill, get paid on the spot.",
  },
];

export const metadata: Metadata = {
  alternates: { canonical: routes.home },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={[softwareJsonLd, faqJsonLd()]} />
      <Hero />
      <TradeMarquee />
      <HowItWorks />
      <Pillars />
      <Patchwork />
      <SupportingFeatures />
      <TradesGrid />
      <section className="py-24">
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title="Simple plans that pay for themselves"
            description="One saved no-show a month covers the bill. Start free, upgrade when your crew grows."
            align="center"
          />
          <div className="mt-14">
            <PricingCards />
          </div>
        </Container>
      </section>
      <section className="border-t border-line bg-paper-deep/50 pb-8 pt-24">
        <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading eyebrow="Questions" title="Good questions, straight answers" />
            <TalkToUsCard className="mt-8" />
          </div>
          <FaqList />
        </Container>
      </section>
      <CtaBand />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="map-grid-light absolute inset-y-0 right-0 hidden w-[46%] rounded-bl-[4rem] lg:block"
        aria-hidden="true"
      />
      <Container className="relative grid grid-cols-1 items-center gap-14 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pb-28">
        {/* No entrance animation here: the headline is the LCP element. */}
        <div>
          <Eyebrow>For the trades that come to you</Eyebrow>
          <h1 className="mt-5 text-5xl font-extrabold leading-[0.98] sm:text-7xl">
            Book the job.
            <br />
            Get paid.
            <br />
            <span className="relative inline-block text-brand-600">
              Drive less.
              <svg
                viewBox="0 0 300 18"
                preserveAspectRatio="none"
                className="absolute -bottom-2 left-0 h-3.5 w-full text-sun"
                aria-hidden="true"
              >
                <path d="M3 13 C 70 3, 150 3, 297 9" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">
            Detailers, cleaners, landscapers, plumbers, groomers: if you drive to your customers, {siteConfig.name}{" "}
            gives you one link that shows off your services, books customers, takes deposits and collects payment.
            Then AI plans the smartest route through your day.
          </p>

          <ClaimLinkForm className="mt-9" />

          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {["Free to start", "Live in about 5 minutes", "No contracts"].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-brand-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <a
            href="#how-it-works"
            className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            See how it works
            <ArrowDown className="size-4" aria-hidden="true" />
          </a>
        </div>

        <HeroShowcase />
      </Container>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-24">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From first click to paid job, without the phone tag"
          description="Three steps. No website to build, no app for your customers to download."
          align="center"
        />
        <div className="relative mt-16">
          <div
            className="absolute left-[16%] right-[16%] top-9 hidden border-t-2 border-dashed border-line-strong md:block"
            aria-hidden="true"
          />
          <ol className="relative grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative rounded-[1.75rem] border border-line bg-card p-7 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-paper">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-display text-5xl font-extrabold text-brand-400">0{index + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            );
          })}
          </ol>
        </div>
      </Container>
    </section>
  );
}

function Pillars() {
  return (
    <section className="border-y border-line bg-card py-24">
      <Container>
        <SectionHeading
          eyebrow="What you get"
          title="Everything between “Can you come Tuesday?” and “Paid.”"
          description="Four tools that usually live in four different apps, working together from the same link."
        />
        <div className="mt-16 space-y-24">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-600">
                    <Icon className="size-4" aria-hidden="true" />
                    {pillar.kicker}
                  </span>
                  <h3 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{pillar.title}</h3>
                  <p className="mt-4 text-lg leading-relaxed text-ink-soft">{pillar.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex items-center gap-2.5">
                        <span className="grid size-5 place-items-center rounded-full bg-sky/60">
                          <Check className="size-3 text-brand-700" aria-hidden="true" />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="map-grid-light flex min-h-80 items-center justify-center rounded-[2rem] p-6 sm:p-10">
                  <PillarVisual kicker={pillar.kicker} />
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

function Patchwork() {
  return (
    <section className="py-24">
      <Container>
        <SectionHeading
          eyebrow="Trade in the juggling act"
          title="One link replaces the notes app, the payment app and the paper map"
          align="center"
        />
        <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-[1.75rem] border border-line bg-card shadow-card">
          <div className="hidden grid-cols-2 border-b border-line bg-paper-deep/60 text-sm font-semibold md:grid">
            <p className="px-7 py-3 text-ink-soft">The old way</p>
            <p className="border-l border-line px-7 py-3 text-brand-600">With {siteConfig.name}</p>
          </div>
          {/* Phones get each row as a before/after pair; wider screens get two columns. */}
          {patchwork.map((row) => (
            <div key={row.before} className="grid border-b border-line last:border-b-0 md:grid-cols-2">
              <div className="flex gap-3 px-5 pb-2 pt-5 text-ink-soft md:px-7 md:py-5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-clay-soft">
                  <X className="size-3 text-clay" aria-hidden="true" />
                </span>
                <p>
                  <span className="sr-only">The old way: </span>
                  {row.before}
                </p>
              </div>
              <div className="flex gap-3 px-5 pb-5 pt-2 font-semibold md:border-l md:border-line md:px-7 md:py-5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50">
                  <Check className="size-3 text-brand-600" aria-hidden="true" />
                </span>
                <p>
                  <span className="sr-only">With {siteConfig.name}: </span>
                  {row.after}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function SupportingFeatures() {
  return (
    <section className="pb-24">
      <Container>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading eyebrow="And the details" title="The little things that add up to hours" />
          <Link
            href={routes.features}
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-600 hover:text-brand-700"
          >
            All features
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supportingFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex gap-4 rounded-[1.5rem] border border-line bg-card p-6 transition-shadow hover:shadow-card sm:block">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-bold sm:mt-4">{feature.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink-soft">{feature.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/** A tile per trade, so every visitor finds their own work on the page. */
function TradesGrid() {
  const shown = trades.filter((trade) => trade.id !== "other").slice(0, 11);
  return (
    <section className="map-grid-light border-y border-line py-24">
      <Container>
        <SectionHeading
          eyebrow="Built for your trade"
          title="If you drive to your customers, it fits"
          description="Pick your trade at setup and start from a ready-made menu of services and prices. Change anything."
          align="center"
        />
        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((trade) => {
            const Icon = trade.icon;
            const sample = trade.sampleServices.find((service) => service.price > 0) ?? trade.sampleServices[0];
            return (
              <li key={trade.id}>
                <Link
                  href={`${routes.industries}#${trade.id}`}
                  className="group flex h-full flex-col gap-3 rounded-[1.25rem] border border-line bg-card p-4 transition-shadow hover:shadow-card sm:p-5"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-paper transition-colors group-hover:bg-sun group-hover:text-ink">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-bold leading-tight">{trade.name}</span>
                  <span className="mt-auto text-sm text-ink-soft">
                    {sample.name}
                    {sample.price > 0 ? <span className="font-semibold text-ink"> · from {formatPrice(sample.price)}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href={routes.industries}
              className="flex h-full flex-col justify-between gap-3 rounded-[1.25rem] border border-dashed border-line-strong bg-card/60 p-4 font-semibold hover:border-ink-soft sm:p-5"
            >
              <span>Something else?</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-brand-600">
                See every trade
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        </ul>
      </Container>
    </section>
  );
}
