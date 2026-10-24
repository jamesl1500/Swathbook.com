import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { CtaBand } from "@/components/marketing/cta-band";
import { TradeMosaicAside } from "@/components/marketing/hero-asides";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { trades } from "@/libs/marketing/content";
import { formatPrice } from "@/libs/utils";

export const metadata: Metadata = pageMetadata({
  title: "Booking & Routing Software for Detailers, Cleaners, Landscapers & More",
  description:
    "Swathbook fits landscapers, lawn care, plumbers, mobile detailers, pool techs, cleaners and every trade that drives to its customers. See starter menus.",
  path: routes.industries,
});

const fits = [
  { title: "You drive to your customers", body: "If your workday is a string of addresses, route planning pays for itself fast." },
  { title: "You're tired of phone tag", body: "Let customers pick an open slot instead of trading voicemails." },
  { title: "No-shows cost you real money", body: "A deposit at booking means people actually show up (or you're covered)." },
  { title: "You'd rather not chase invoices", body: "Bill from your phone when the job's done and get paid on the spot." },
];

export default function IndustriesPage() {
  const list = trades.filter((trade) => trade.id !== "other");

  return (
    <>
      <PageHero
        eyebrow="Who it's for"
        title="If your office is a truck or a van, you're in the right place."
        description="Detailing, cleaning, lawn care, plumbing, grooming and more: Swathbook works for any business that drives to its customers. Pick your trade during setup and we'll suggest a starter menu you can tweak."
        aside={<TradeMosaicAside />}
      />

      <section className="py-24">
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((trade) => {
              const Icon = trade.icon;
              return (
                <article
                  key={trade.id}
                  id={trade.id}
                  className="group flex scroll-mt-24 flex-col rounded-[1.75rem] border border-line bg-card p-6 transition-shadow hover:shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-paper">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="text-xl font-bold">{trade.name}</h2>
                  </div>
                  <p className="mt-4 flex-1 leading-relaxed text-ink-soft">{trade.blurb}</p>
                  <div className="mt-5 rounded-xl bg-paper px-4 py-3">
                    <p className="label-tag text-ink-faint">Starter menu</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {trade.sampleServices.map((service) => (
                        <li key={service.name} className="flex justify-between gap-3">
                          <span className="truncate">{service.name}</span>
                          <span className="shrink-0 font-semibold">
                            {service.price > 0 ? formatPrice(service.price) : "Free"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
            <article className="flex flex-col justify-between gap-6 rounded-[1.75rem] border-2 border-dashed border-line-strong bg-card/60 p-6">
              <div>
                <span className="grid size-11 place-items-center rounded-xl bg-sun text-ink">
                  <Plus className="size-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-xl font-bold">Don&apos;t see your trade?</h2>
                <p className="mt-2 leading-relaxed text-ink-soft">
                  Window washing, junk removal, mobile mechanics, tutoring, photography… If you drive to your customers, you
                  can build your own menu from scratch.
                </p>
              </div>
              <Link href={routes.signup} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
                Start with a blank menu
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          </div>
        </Container>
      </section>

      <section className="border-y border-line bg-card py-24">
        <Container>
          <SectionHeading
            eyebrow="Is it a fit?"
            title="Swathbook is for you if…"
            align="center"
          />
          <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2">
            {fits.map((fit, index) => (
              <div key={fit.title} className="flex gap-4 rounded-[1.5rem] border border-line bg-paper p-6">
                <span className="font-display text-3xl font-extrabold text-brand-400">{index + 1}</span>
                <div>
                  <h3 className="text-lg font-bold">{fit.title}</h3>
                  <p className="mt-1 text-ink-soft">{fit.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CtaBand
        title="Don't see your trade? You still fit."
        description="Set up any service with your own prices, durations and deposits."
      />
    </>
  );
}
