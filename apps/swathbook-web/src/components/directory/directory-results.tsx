import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX, TriangleAlert } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonStyles } from "@/components/ui/button";
import { DIRECTORY_PAGE_SIZE, MAX_DIRECTORY_PAGE, directoryHref, type DirectoryQuery, type DirectoryResults } from "@/libs/business-directory";
import { routes } from "@/libs/routes";
import { businessListJsonLd } from "@/libs/seo";
import { BusinessResult } from "./business-result";

/**
 * One page of directory results, with paging and (when listing, not
 * searching) ItemList structured data for the businesses shown.
 */
export function DirectoryResultsList({
  results,
  query,
  basePath,
  listName,
  emptyHint,
}: {
  results: DirectoryResults;
  query: DirectoryQuery;
  /** The page these results belong to; paging links stay on it. */
  basePath: string;
  /** Names the ItemList, e.g. "Lawn mowing services on Swathbook". */
  listName: string;
  emptyHint?: string;
}) {
  const { businesses, total, failed } = results;

  if (failed) {
    return (
      <div role="alert" className="flex gap-3 rounded-[1.25rem] border border-clay/40 bg-clay-soft p-5 text-clay-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>We couldn&apos;t load businesses just now. Please refresh to try again.</p>
      </div>
    );
  }

  if (!businesses.length) {
    return (
      <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-line-strong px-6 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <SearchX className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-bold">{query.q ? `No matches for “${query.q}”` : "No businesses here yet"}</h2>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
          {emptyHint ?? (query.q ? "Try a service or a town, like “mowing” or “Austin”." : "New businesses join every week. Check back soon.")}
        </p>
        {query.q || basePath !== routes.findBusinesses ? (
          <Link href={routes.findBusinesses} className={buttonStyles({ variant: "secondary", className: "mt-5" })}>
            See all businesses
          </Link>
        ) : null}
      </div>
    );
  }

  const offset = (query.page - 1) * DIRECTORY_PAGE_SIZE;
  const lastPage = Math.min(Math.ceil(total / DIRECTORY_PAGE_SIZE), MAX_DIRECTORY_PAGE);
  const shownTo = offset + businesses.length;

  return (
    <div>
      {/* Searches aren't indexed, so their lists carry no structured data. */}
      {query.q ? null : <JsonLd data={businessListJsonLd({ name: listName, path: directoryHref(basePath, { page: query.page }), businesses, offset })} />}
      <p className="mb-4 text-sm text-ink-soft" role="status">
        {total === 1 ? "1 business" : `${total.toLocaleString("en-US")} businesses`}
        {total > businesses.length ? ` · showing ${offset + 1}–${shownTo}` : null}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {businesses.map((business) => (
          <li key={business.id} className="min-w-0">
            <BusinessResult business={business} />
          </li>
        ))}
      </ul>
      {lastPage > 1 ? (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-between gap-3">
          {query.page > 1 ? (
            <Link href={directoryHref(basePath, { ...query, page: query.page - 1 })} rel="prev" className={buttonStyles({ variant: "secondary" })}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-soft">
            Page {query.page} of {lastPage}
          </span>
          {query.page < lastPage ? (
            <Link href={directoryHref(basePath, { ...query, page: query.page + 1 })} rel="next" className={buttonStyles({ variant: "secondary" })}>
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

export function DirectoryResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading businesses">
      <div className="mb-4 h-5 w-32 animate-pulse rounded bg-paper-deep" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-[1.25rem] bg-paper-deep" />
        ))}
      </div>
    </div>
  );
}
