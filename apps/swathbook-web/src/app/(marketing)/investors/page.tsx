import type { Metadata } from "next";
import { Banknote, Camera, CloudRain, Link2, Map, Route, Ruler, Smartphone, TrendingUp, Users } from "lucide-react";
import { FaqList } from "@/components/marketing/faq-list";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { JsonLd } from "@/components/seo/json-ld";
import { SWATHBOOK_FEE_LABEL, swathbookFeeCents } from "@/libs/billing/fees";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { faqJsonLd, pageMetadata } from "@/libs/seo";
import { formatCents } from "@/libs/utils";
import { InvestorForm } from "./investor-form";

export const metadata: Metadata = pageMetadata({
  title: "Investors",
  description:
    "Swathbook is talking with early investors. Learn how we make money (monthly plans plus 1.25% of every payment our businesses take) and register your interest.",
  path: routes.investors,
});

const thesis = [
  {
    icon: Users,
    title: "A huge, underserved market",
    body: "Detailers, cleaners, lawn crews, plumbers, pool techs, groomers: these small businesses drive to their customers, and many still run on texts, a calendar app and a payment app.",
  },
  {
    icon: Link2,
    title: "One link replaces the patchwork",
    body: "Services, prices, booking, deposits, payment, the day's route and the crew's schedule, in one link the owner puts on their truck, their Google profile and every text.",
  },
  {
    icon: TrendingUp,
    title: "Two ways we earn",
    body: `A monthly plan from every business ($29 Solo, $79 Crew) covers running the platform, and ${SWATHBOOK_FEE_LABEL} of what businesses are paid through it grows with them.`,
  },
];

const built = [
  { icon: Link2, title: "Booking link", body: "A public page with services, prices, photos and live availability." },
  { icon: Banknote, title: "Deposits & payments", body: "Card payments straight to the business through Stripe Connect." },
  { icon: Route, title: "Route planning", body: "Each day's stops ordered to cut drive time, with one-tap re-planning when jobs move." },
  { icon: Ruler, title: "Satellite quotes", body: "Customers outline their yard or driveway and see a price before booking." },
  { icon: Map, title: "Neighbor pricing", body: "A discount on days the crew is already nearby, so customers fill the gaps in the route." },
  { icon: Camera, title: "Job reports", body: "Before-and-after photos, a link to pay the balance, tips and a review nudge after every job." },
  { icon: CloudRain, title: "Rain days", body: "Forecast warnings and quick rescheduling for outdoor work." },
  { icon: Smartphone, title: "Owner & customer apps", body: "Apps built for iOS and Android, for crews in the field and the people they serve." },
];

const investorFaqs = [
  {
    question: "Is this an offer to sell shares?",
    answer:
      "No. This page shares information about Swathbook and collects interest. It isn't an offer to sell, or a request for an offer to buy, any security. Any investment would be made only through definitive documents, to eligible investors, in line with applicable securities laws.",
  },
  {
    question: "What happens after I register?",
    answer: "A founder reads every note and replies personally. If it's a fit, we'll share more about the company and set up a call.",
  },
  {
    question: "Do I need to be accredited?",
    answer: "Tell us either way. What we can offer, and to whom, depends on how a round is structured, and knowing helps us follow up the right way.",
  },
  {
    question: "Can I just email you?",
    answer: `Of course: ${siteConfig.supportEmail}. Put "Investing" in the subject so it reaches the right person.`,
  },
];

/** The business model at a glance: what Swathbook earns as bookings flow through it. */
function ModelAside() {
  const volumes = [100_000, 1_000_000, 10_000_000];
  return (
    <div className="-rotate-1 rounded-[1.75rem] border border-line bg-card p-6 shadow-card">
      <p className="label-tag text-ink-faint">How Swathbook earns</p>
      <p className="mt-3 font-display text-5xl font-extrabold tracking-tight text-brand-700">{SWATHBOOK_FEE_LABEL}</p>
      <p className="mt-1 text-ink-soft">of every payment businesses take through Swathbook, on top of their monthly plan</p>
      <dl className="mt-6 space-y-2.5 text-sm">
        {volumes.map((volume) => (
          <div key={volume} className="flex items-baseline justify-between gap-4 rounded-xl bg-paper px-4 py-2.5">
            <dt className="text-ink-soft">{formatCents(volume).replace(".00", "")} in payments</dt>
            <dd className="font-semibold tabular-nums">{formatCents(swathbookFeeCents(volume)).replace(".00", "")} to Swathbook</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function InvestorsPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(investorFaqs)} />
      <PageHero
        eyebrow="Investors"
        title="Back the software field businesses run on."
        description="Swathbook gives the people who drive to their customers one link to get booked, get paid and drive less. We're talking with early investors now."
        aside={<ModelAside />}
      >
        <a
          href="#register"
          className="mt-8 inline-flex min-h-12 items-center rounded-full bg-brand-600 px-6 font-semibold text-paper hover:bg-brand-700"
        >
          Register your interest
        </a>
      </PageHero>

      <section className="py-24" aria-labelledby="thesis-heading">
        <Container>
          <SectionHeading eyebrow="Why Swathbook" title={<span id="thesis-heading">Why now, and why us</span>} />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {thesis.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-[1.75rem] border border-line bg-card p-7">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{item.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="border-t border-line bg-paper-deep/50 py-24" aria-labelledby="built-heading">
        <Container>
          <SectionHeading
            eyebrow="Where we are"
            title={<span id="built-heading">Live, and in the hands of early businesses</span>}
            description="The product is built and running, and we're shaping it with feedback from the first businesses on it."
          />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {built.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="rounded-[1.25rem] border border-line bg-card p-5">
                  <Icon className="size-5 text-brand-600" aria-hidden="true" />
                  <p className="mt-3 font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      <section id="register" className="scroll-mt-24 py-24" aria-labelledby="register-heading">
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <SectionHeading
              eyebrow="Get in early"
              title={<span id="register-heading">Register your interest</span>}
              description="Tell us a little about yourself. We'll reply personally and, if it's a fit, share more and set up a call."
            />
            <div className="mt-10">
              <FaqList items={investorFaqs} />
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-line bg-card p-6 sm:p-8 lg:self-start">
            <InvestorForm />
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-10">
        <Container>
          <p className="max-w-4xl text-xs leading-relaxed text-ink-faint">
            This page is for information only. It is not an offer to sell, or a solicitation of an offer to buy, any securities of {siteConfig.legalName},
            and nothing here is investment, legal or tax advice. Any offering will be made only through definitive offering documents, to investors who
            qualify, and in compliance with applicable securities laws. Statements about plans and the market are forward-looking and may not come true.
          </p>
        </Container>
      </section>
    </>
  );
}
