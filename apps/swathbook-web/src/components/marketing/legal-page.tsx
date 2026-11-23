import Link from "next/link";
import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { slugify } from "@/libs/utils";
import { Container, Eyebrow } from "./section";

export type LegalSection = { title: string; body: ReactNode };

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** A link to another company's terms or policy. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700">
      {children}
    </a>
  );
}

/** Who to write to, as it should appear in a legal notice. */
export function LegalContact() {
  return (
    <address className="not-italic">
      {siteConfig.legalName}
      <br />
      {siteConfig.legalAddress.street}
      <br />
      {siteConfig.legalAddress.cityStateZip}
      <br />
      <a
        href={`mailto:${siteConfig.supportEmail}`}
        className="inline-flex min-h-11 items-center font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700"
      >
        {siteConfig.supportEmail}
      </a>
    </address>
  );
}

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

      <Container className="grid grid-cols-[minmax(0,1fr)] gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-20">
        <div className="min-w-0 max-w-[68ch]">
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
            <Link href={routes.contact} className="flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:text-brand-700">
              Other ways to reach us
            </Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
