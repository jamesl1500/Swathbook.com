import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { DirectoryFaq } from "@/components/directory/directory-faq";
import { DirectoryResultsList, DirectoryResultsSkeleton } from "@/components/directory/directory-results";
import { DirectorySearchForm } from "@/components/directory/directory-search-form";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonStyles } from "@/components/ui/button";
import { listDirectoryTrades, parseDirectoryQuery, searchDirectory } from "@/libs/business-directory";
import { directoryFaqs, directoryTrades, findDirectoryTrade } from "@/libs/marketing/directory";
import { routes, tradeDirectoryPath } from "@/libs/routes";
import { breadcrumbJsonLd, pageMetadata } from "@/libs/seo";

const TITLE = "Find local pros you can book online";
const DESCRIPTION =
  "Search local detailers, cleaners, lawn care pros, plumbers and more. See prices up front, pick an open time and book online in under a minute.";

export async function generateMetadata({ searchParams }: PageProps<"/businesses">): Promise<Metadata> {
  const query = parseDirectoryQuery(await searchParams);
  const base = pageMetadata({ title: TITLE, description: DESCRIPTION, path: routes.findBusinesses });
  // Search results are for people, not search engines: keep them out of the
  // index but let crawlers follow through to the businesses.
  if (query.q || query.trade) {
    return { ...base, title: query.q ? `“${query.q}”: search results` : TITLE, robots: { index: false, follow: true } };
  }
  if (query.page > 1) {
    const path = `${routes.findBusinesses}?page=${query.page}`;
    return { ...base, title: `${TITLE} (page ${query.page})`, alternates: { canonical: path } };
  }
  return base;
}

export default function BusinessesPage({ searchParams }: PageProps<"/businesses">) {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Find a pro", path: routes.findBusinesses }])} />
      <section className="border-b border-line bg-paper-deep/50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="label-tag text-brand-600">Find a pro</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">{TITLE}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{DESCRIPTION}</p>
          <DirectorySearchForm action={routes.findBusinesses} className="mt-8" />
          <TradeLinks />
        </div>
      </section>

      <section aria-label="Businesses" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Suspense fallback={<DirectoryResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </section>

      <section aria-labelledby="browse-trades" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <h2 id="browse-trades" className="text-2xl font-extrabold">
          Browse by trade
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {directoryTrades.map((trade) => (
            <li key={trade.id}>
              <Link
                href={tradeDirectoryPath(trade.id)}
                className="flex h-full items-start justify-between gap-3 rounded-[1.25rem] border border-line bg-card p-4 transition-colors hover:border-ink-faint"
              >
                <span>
                  <span className="block font-bold">{trade.heading}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{trade.intro}</span>
                </span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="px-4 pb-16 sm:px-6">
        <DirectoryFaq items={directoryFaqs(null)} />
      </div>

      <section className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-xl font-extrabold">Run a business that comes to customers?</h2>
            <p className="mt-1 text-ink-soft">Get a booking page, take deposits and show up here. Try it free for 7 days.</p>
          </div>
          <Link href={routes.signup} className={buttonStyles({ variant: "primary" })}>
            Start your free trial
          </Link>
        </div>
      </section>
    </>
  );
}

/** Shortcuts to trades that have businesses right now. Cached, so it's part of the static shell. */
async function TradeLinks() {
  const live = (await listDirectoryTrades()).filter((row) => findDirectoryTrade(row.trade));
  if (!live.length) return null;
  return (
    <nav aria-label="Popular trades" className="mt-6 flex flex-wrap gap-2">
      {live.slice(0, 8).map((row) => (
        <Link
          key={row.trade}
          href={tradeDirectoryPath(row.trade)}
          className="rounded-full border border-line-strong bg-card px-3.5 py-1.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink-soft hover:text-ink"
        >
          {findDirectoryTrade(row.trade)!.name}
        </Link>
      ))}
    </nav>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/businesses">["searchParams"] }) {
  const query = parseDirectoryQuery(await searchParams);
  const results = await searchDirectory(query);
  return <DirectoryResultsList results={results} query={query} basePath={routes.findBusinesses} listName="Businesses you can book on Swathbook" />;
}
