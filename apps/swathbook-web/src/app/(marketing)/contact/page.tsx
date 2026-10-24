import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { Building2, LifeBuoy, Mail } from "lucide-react";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { ReplyAside } from "@/components/marketing/hero-asides";
import { Container, PageHero, SectionHeading } from "@/components/marketing/section";
import { siteConfig } from "@/libs/globals/site";

export const metadata: Metadata = pageMetadata({
  title: "Contact Us",
  description:
    "Questions about Swathbook, support requests or fleet plans? Email the team and we'll reply within one business day.",
  path: routes.contact,
});

const channels = [
  {
    icon: Mail,
    title: "General questions",
    body: "Wondering if Swathbook fits your business? We're happy to talk it through.",
    subject: "Question about Swathbook",
  },
  {
    icon: LifeBuoy,
    title: "Support",
    body: "Already using Swathbook and something's not right? Tell us what happened.",
    subject: "Support request",
  },
  {
    icon: Building2,
    title: "Fleet & multi-location",
    body: "Running several crews or locations? Let's set up a plan that fits.",
    subject: "Fleet plan inquiry",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Real people, quick answers."
        description="We usually reply within one business day. If you're mid-job, a short email is perfect; we'll take it from there."
        aside={<ReplyAside />}
      />
      <section className="py-24">
        <Container className="grid gap-5 md:grid-cols-3">
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <a
                key={channel.title}
                href={`mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent(channel.subject)}`}
                className="group flex flex-col rounded-[1.75rem] border border-line bg-card p-7 transition-shadow hover:shadow-card"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-paper">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-bold">{channel.title}</h2>
                <p className="mt-2 flex-1 leading-relaxed text-ink-soft">{channel.body}</p>
                <span className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-brand-600 group-hover:border-brand-600">
                  <Mail className="size-4" aria-hidden="true" />
                  Email us
                </span>
              </a>
            );
          })}
        </Container>
      </section>

      <section className="border-t border-line bg-paper-deep/50 pb-8 pt-24">
        <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <SectionHeading eyebrow="Quick answers" title="You might not need to wait" description="The questions we hear most, answered." />
            <p className="mt-6 font-mono text-sm text-ink-soft">
              Or write to <a href={`mailto:${siteConfig.supportEmail}`} className="font-semibold text-brand-600 underline underline-offset-4">{siteConfig.supportEmail}</a>
            </p>
          </div>
          <FaqList />
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
