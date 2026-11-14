import { Search } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/libs/utils";
import { SearchQuerySync } from "./search-query-sync";

/**
 * A plain GET form: searching works without JavaScript and results have real
 * URLs. It renders in the static shell; SearchQuerySync fills in ?q= on load.
 */
export function DirectorySearchForm({
  action,
  placeholder = "Search by business, service or town",
  label = "Search businesses",
  className,
}: {
  /** Where results show: /businesses, or a trade page to search within it. */
  action: string;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <form action={action} method="get" role="search" className={cn("flex w-full max-w-2xl gap-2", className)}>
      <label htmlFor="directory-q" className="sr-only">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          id="directory-q"
          name="q"
          type="search"
          placeholder={placeholder}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          className="block h-13 w-full rounded-full border border-line-strong bg-card pl-12 pr-4 text-base text-ink shadow-[inset_0_1px_2px_rgb(20_38_27/0.06)] placeholder:text-ink-faint hover:border-ink-faint focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200"
        />
      </div>
      <button type="submit" className={buttonStyles({ size: "lg", className: "shrink-0 px-5 sm:px-7" })}>
        Search
      </button>
      <SearchQuerySync inputId="directory-q" />
    </form>
  );
}
