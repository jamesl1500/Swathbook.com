import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { ArrowRight } from "lucide-react";
import { DayAside } from "@/components/marketing/hero-asides";
import { CtaBand } from "@/components/marketing/cta-band";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { siteConfig } from "@/libs/globals/site";

export const metadata: Metadata = pageMetadata({
  title: "About Us",
  description:
    "Why we're building Swathbook: booking, payments and route planning software that gives field service owners their time back.",
  path: routes.about,
});

const values = [
  {
    title: "Your time is the product",
    body: "Every feature has to give a field business back minutes: on the phone, on the road, or chasing a payment.",
  },
  {
    title: "Works from the cab of a truck",
    body: "Big buttons, few steps, and nothing that needs a laptop. If it's awkward with work gloves on, we're not done.",
  },
  {
    title: "Plain prices, plain words",
    body: "No hidden fees and no jargon, for you or your customers.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title="Built for the people who keep everything running."
        description="The person who details your car, cleans your home, fixes your sink or cuts your grass runs a real business, often from a phone between jobs. They deserve software built for that."
        aside={<DayAside />}
      />

      <section className="py-24">
        <Container className="grid gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Why we started" title="Too much of the workday happens between jobs" />
            {/* The pile of tools the product replaces, at a glance. */}
            <div className="mt-8 rounded-[1.5rem] border border-line bg-card p-6" aria-label="What Swathbook replaces">
              <p className="label-tag text-ink-faint">The usual patchwork</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {["Calendar app", "Notes app", "Payment app", "Group text", "Paper map", "Invoice pad"].map((tool) => (
                  <li key={tool} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink-soft line-through decoration-clay decoration-2">
                    {tool}
                  </li>
                ))}
              </ul>
              <p className="mt-5 flex items-center gap-2 font-semibold">
                <span className="grid size-7 place-items-center rounded-full bg-brand-600 text-paper">
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
                One link for all of it
              </p>
            </div>
          </div>
          <div className="space-y-5 text-lg leading-relaxed text-ink-soft">
            <p>
              A <em>swath</em> is one clean, steady pass: a buffer across a hood, a brush down a wall, a mower
              across a yard. It&apos;s efficient work that leaves clean lines behind it. That&apos;s what we want the
              business side of field work to feel like, whatever your trade.
            </p>
            <p>
              Today, most owner-operators are stitching together a calendar, a notes app, a payment app, a group
              text and a map. Bookings slip through the cracks, no-shows eat mornings, and the route is whatever
              order the calls came in.
            </p>
            <p>
              {siteConfig.name} puts all of it behind one link: customers book themselves and put down a deposit,
              you get paid when the job&apos;s done, and AI lines up your day so you spend it working, not driving.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-y border-line bg-card py-24">
        <Container>
          <SectionHeading eyebrow="What we believe" title="Three things we won't compromise on" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {values.map((value, index) => (
              <div key={value.title} className="rounded-[1.75rem] border border-line bg-paper p-7">
                <span className="font-display text-4xl font-extrabold text-brand-500">0{index + 1}</span>
                <h3 className="mt-4 text-xl font-bold">{value.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{value.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
