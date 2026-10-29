import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { Check } from "lucide-react";
import { BookingCard } from "@/components/booking/booking-card";
import { CtaBand } from "@/components/marketing/cta-band";
import { PillarVisual } from "@/components/marketing/pillar-visual";
import { FourToolsAside } from "@/components/marketing/hero-asides";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { findTrade, pillars, supportingFeatures } from "@/libs/marketing/content";

export const metadata: Metadata = pageMetadata({
  title: "Features: Booking Pages, Deposits & AI Routing",
  description:
    "Online booking pages, deposits, card payments and AI route planning in one app. See every Swathbook feature built for field service businesses.",
  path: routes.features,
});

const roadmap = [
  { title: "Text message reminders", body: "Confirmations and on-my-way texts, alongside the emails customers already get." },
  { title: "Recurring plans", body: "Weekly, bi-weekly and seasonal services that rebook themselves." },
  { title: "Quotes & estimates", body: "Send a quote, get it approved, and turn it into a booked job in one tap." },
  { title: "Reviews on autopilot", body: "Ask happy customers for a Google review right after they pay." },
];

export default function FeaturesPage() {
  const detailing = findTrade("mobile-detailing")!;

  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything a field business needs. Nothing it doesn't."
        description="Swathbook connects the four jobs you do every week: getting booked, getting committed, getting paid and getting there. Here's how each piece works."
        aside={<FourToolsAside />}
      />

      <section className="py-24">
        <Container className="space-y-28">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <div key={pillar.title} id={pillar.kicker.toLowerCase().replace(/\s+/g, "-")} className="scroll-mt-24 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-600">
                    <Icon className="size-4" aria-hidden="true" />
                    {pillar.kicker}
                  </span>
                  <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{pillar.title}</h2>
                  <p className="mt-4 text-lg leading-relaxed text-ink-soft">{pillar.body}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex gap-2.5 rounded-xl border border-line bg-card px-4 py-3 text-[0.95rem]">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="map-grid-light flex items-center justify-center rounded-[2rem] p-6 sm:p-10">
                  {pillar.kicker === "Your link" ? (
                    <BookingCard
                      businessName="Shine On Mobile Detailing"
                      tagline="We come to your driveway"
                      slug="shine-on"
                      services={detailing.sampleServices}
                      selectedIndex={1}
                      className="w-full max-w-sm"
                    />
                  ) : (
                    <PillarVisual kicker={pillar.kicker} />
                  )}
                </div>
              </div>
            );
          })}
        </Container>
      </section>

      <section className="border-y border-line bg-card py-24">
        <Container>
          <SectionHeading eyebrow="Day-to-day" title="Built-in from day one" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {supportingFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-[1.5rem] border border-line bg-paper p-7">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-600 text-paper">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{feature.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink-soft">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="py-24">
        <Container>
          <SectionHeading
            eyebrow="On the way"
            title="What we're building next"
            description="We ship with the people who use Swathbook every day. Here's what's coming up."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {roadmap.map((item) => (
              <div key={item.title} className="flex gap-4 rounded-[1.5rem] border border-dashed border-line-strong p-6">
                <span className="label-tag h-fit shrink-0 rounded-full bg-sun-soft px-2.5 py-1 text-ink">Soon</span>
                <div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-1 text-ink-soft">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
