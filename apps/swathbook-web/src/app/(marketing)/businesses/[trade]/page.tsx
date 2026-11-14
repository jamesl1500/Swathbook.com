import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarCheck, ChevronRight, CreditCard, ListChecks } from "lucide-react";
import { DirectoryFaq } from "@/components/directory/directory-faq";
import { DirectoryResultsList, DirectoryResultsSkeleton } from "@/components/directory/directory-results";
import { DirectorySearchForm } from "@/components/directory/directory-search-form";
import { JsonLd } from "@/components/seo/json-ld";
import { parseDirectoryQuery, searchDirectory } from "@/libs/business-directory";
import { directoryFaqs, directoryTrades, findDirectoryTrade, type DirectoryTrade } from "@/libs/marketing/directory";
import { routes, tradeDirectoryPath } from "@/libs/routes";
import { breadcrumbJsonLd, metaDescription, pageMetadata } from "@/libs/seo";

export function generateStaticParams() {
  return directoryTrades.map((trade) => ({ trade: trade.id }));
}

function tradeTitle(trade: DirectoryTrade) {
  return `${trade.heading} you can book online`;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/businesses/[trade]">): Promise<Metadata> {
  const [{ trade: tradeId }, rawQuery] = await Promise.all([params, searchParams]);
  const trade = findDirectoryTrade(tradeId);
  if (!trade) return { title: "Not found", robots: { index: false, follow: false } };

  const query = parseDirectoryQuery(rawQuery);
  const path = tradeDirectoryPath(trade.id);
  const { total, failed } = await searchDirectory({ q: "", trade: trade.id, page: 1 });
  const lead = total > 1 ? `Compare ${total} local ${trade.pro}s on Swathbook.` : `Book a local ${trade.pro} on Swathbook.`;
  const description = metaDescription(`${lead} ${trade.intro}`);
  const base = pageMetadata({ title: tradeTitle(trade), description, path });

  // An empty page is thin content: crawlable, but not indexed until a business joins.
  // Searches within the trade are never indexed.
  if (query.q || (!failed && total === 0)) return { ...base, robots: { index: false, follow: true } };
  if (query.page > 1) return { ...base, title: `${tradeTitle(trade)} (page ${query.page})`, alternates: { canonical: `${path}?page=${query.page}` } };
  return base;
}

/**
 * Every real trade is prerendered (generateStaticParams), so reading the
 * param up front costs nothing for them. An unknown trade shows the not-found
 * page; as with unknown booking links, streaming keeps the status at 200 and
 * generateMetadata marks it noindex.
 */
export default async function TradeDirectoryPage({ params, searchParams }: PageProps<"/businesses/[trade]">) {
  const { trade: tradeId } = await params;
  const trade = findDirectoryTrade(tradeId);
  if (!trade) notFound();
  return <TradeDirectory trade={trade} searchParams={searchParams} />;
}

function TradeDirectory({ trade, searchParams }: { trade: DirectoryTrade; searchParams: PageProps<"/businesses/[trade]">["searchParams"] }) {
  const path = tradeDirectoryPath(trade.id);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Find a pro", path: routes.findBusinesses },
          { name: trade.heading, path },
        ])}
      />
      <section className="border-b border-line bg-paper-deep/50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-soft">
              <li>
                <Link href={routes.home} className="hover:text-ink hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li>
                <Link href={routes.findBusinesses} className="hover:text-ink hover:underline">
                  Find a pro
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li aria-current="page" className="font-semibold text-ink">
                {trade.name}
              </li>
            </ol>
          </nav>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">{tradeTitle(trade)}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{trade.intro}</p>
          <DirectorySearchForm
            action={path}
            label={`Search ${trade.heading.toLowerCase()}`}
            placeholder="Search by name, service or town"
            className="mt-8"
          />
        </div>
      </section>

      <section aria-label={`${trade.heading} on Swathbook`} className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Suspense fallback={<DirectoryResultsSkeleton />}>
          <TradeResults trade={trade} path={path} searchParams={searchParams} />
        </Suspense>
      </section>

      <section aria-labelledby="how-it-works" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <h2 id="how-it-works" className="text-2xl font-extrabold">
          How booking a {trade.pro} works
        </h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            {
              icon: ListChecks,
              title: "Pick what you need",
              body: trade.examples.length
                ? `Choose from each business's own menu, like ${trade.examples.join(", ")}, with prices shown up front.`
                : "Choose from each business's own menu of services, with prices shown up front.",
            },
            { icon: CalendarCheck, title: "Choose an open time", body: "Only times the business can really make are offered, so there's no back-and-forth." },
            {
              icon: CreditCard,
              title: "Book and manage online",
              body: "Some businesses take a deposit to hold your slot. Reschedule or cancel from your email or your Swathbook account.",
            },
          ].map((step, index) => (
            <li key={step.title} className="rounded-[1.25rem] border border-line bg-card p-5">
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-600">
                <step.icon className="size-4" aria-hidden="true" />
                Step {index + 1}
              </span>
              <h3 className="mt-2 font-bold">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="px-4 pb-14 sm:px-6">
        <DirectoryFaq items={directoryFaqs(trade)} heading={`Booking a ${trade.pro}`} />
      </div>

      <nav aria-labelledby="other-trades" className="border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 id="other-trades" className="text-lg font-extrabold">
            Other local services
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {directoryTrades
              .filter((other) => other.id !== trade.id)
              .map((other) => (
                <li key={other.id}>
                  <Link
                    href={tradeDirectoryPath(other.id)}
                    className="inline-flex rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink-soft hover:text-ink"
                  >
                    {other.heading}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </nav>
    </>
  );
}

async function TradeResults({
  trade,
  path,
  searchParams,
}: {
  trade: DirectoryTrade;
  path: string;
  searchParams: PageProps<"/businesses/[trade]">["searchParams"];
}) {
  // The trade comes from the URL path, never from ?trade=.
  const query = { ...parseDirectoryQuery(await searchParams), trade: trade.id };
  const results = await searchDirectory(query);
  return (
    <DirectoryResultsList
      results={results}
      query={{ ...query, trade: null }}
      basePath={path}
      listName={`${trade.heading} on Swathbook`}
      emptyHint={query.q ? undefined : `No ${trade.pro}s are taking online bookings yet. Browse other trades below, or check back soon.`}
    />
  );
}
