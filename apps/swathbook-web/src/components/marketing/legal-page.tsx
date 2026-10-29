import Link from "next/link";
import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { slugify } from "@/libs/utils";
import { Container, Eyebrow } from "./section";

export type LegalSection = { title: string; body: ReactNode };

/**
 * Shared shell for long-form legal pages: a readable text column, plus an
 * "On this page" list and a contact card that stay in view on wide screens.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  const withIds = sections.map((section) => ({ ...section, id: slugify(section.title) }));
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="map-grid-light absolute inset-0 opacity-70" aria-hidden="true" />
        <Container className="relative py-14 sm:py-20">
          <Eyebrow>Last updated {updated}</Eyebrow>
          <h1 className="mt-4 text-4xl font-extrabold sm:text-6xl">{title}</h1>
          <div className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{intro}</div>
        </Container>
      </section>

      <Container className="grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-20">
        <div className="min-w-0 max-w-[68ch]">
          <p className="mb-10 rounded-xl border border-sun/50 bg-sun-soft px-4 py-3 text-sm text-ink">
            Placeholder copy. Replace with reviewed legal text before launch.
          </p>
          <div className="space-y-12">
            {withIds.map((section, index) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
                <h2 id={`${section.id}-heading`} className="flex items-baseline gap-3 text-2xl font-bold">
                  <span className="font-mono text-sm font-semibold text-brand-500">{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </h2>
                <div className="mt-3 space-y-4 text-lg leading-relaxed text-ink-soft">{section.body}</div>
              </section>
            ))}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="On this page" className="rounded-[1.5rem] border border-line bg-card p-5">
            <p className="label-tag text-ink-faint">On this page</p>
            <ol className="mt-3 space-y-1">
              {withIds.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-ink-soft hover:bg-paper hover:text-ink">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="rounded-[1.5rem] border border-line bg-card p-5">
            <p className="font-bold">Questions about this?</p>
            <p className="mt-1 text-sm text-ink-soft">We&apos;ll explain anything in plain English.</p>
            <a href={`mailto:${siteConfig.supportEmail}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
              <Mail className="size-4" aria-hidden="true" />
              {siteConfig.supportEmail}
            </a>
            <Link href={routes.contact} className="block text-sm font-semibold text-brand-600 hover:text-brand-700">
              Other ways to reach us
            </Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
