"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/libs/utils";

export type TabItem = {
  /** Used in the URL (?tab=<id>), so keep it short and stable. */
  id: string;
  label: string;
  /** A rendered icon, e.g. <Clock />. (Server pages can't pass the component itself to this client component.) */
  icon?: ReactNode;
  /** A small count or status next to the label, e.g. "3 of 7". */
  badge?: ReactNode;
  content: ReactNode;
};

/**
 * Splits a long settings page into sections. The open tab is kept in the URL
 * (?tab=) so it survives a refresh and can be linked to. Every panel stays
 * mounted, so switching tabs never loses something half typed.
 */
export function Tabs({ label, items, param = "tab" }: { label: string; items: TabItem[]; param?: string }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get(param);
  const [active, setActive] = useState(items.some((item) => item.id === requested) ? requested! : items[0].id);
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const scroller = useRef<HTMLDivElement>(null);

  // On phones the tab row scrolls sideways; keep the open tab in view (only
  // horizontally, so opening a deep link never jumps the page).
  useEffect(() => {
    const row = scroller.current;
    const tab = tabRefs.current.get(active);
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const left = tab.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, left - 16);
    }
  }, [active]);

  function select(id: string, focus = false) {
    setActive(id);
    if (focus) tabRefs.current.get(id)?.focus();
    // Replace, not push: switching tabs shouldn't fill the back button. Passing
    // null (not history.state) lets Next.js sync the URL into its router, so a
    // later refresh() after saving a form keeps the tab.
    const params = new URLSearchParams(searchParams.toString());
    if (id === items[0].id) params.delete(param);
    else params.set(param, id);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = items.findIndex((item) => item.id === active);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(items[(target + items.length) % items.length].id, true);
  }

  return (
    <div>
      {/* Scrolls sideways on the narrowest phones rather than wrapping into a second row. */}
      <div ref={scroller} data-allow-overflow className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label={label} className="flex min-w-max gap-1 border-b border-line">
          {items.map((item) => {
            const selected = item.id === active;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(item.id, node);
                  else tabRefs.current.delete(item.id);
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(item.id)}
                onKeyDown={onKeyDown}
                className={cn(
                  "-mb-px inline-flex h-11 cursor-pointer items-center gap-2 border-b-2 px-2.5 text-[0.95rem] font-semibold whitespace-nowrap transition-colors focus-visible:rounded-t-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-200 sm:px-4",
                  selected ? "border-brand-600 text-ink" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
                )}
              >
                {item.icon ? (
                  // Icons only where there's room; on phones the labels need the width.
                  <span className="hidden shrink-0 sm:inline-flex [&>svg]:size-4" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
                {item.badge != null ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", selected ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-ink-soft")}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
          className="min-w-0 focus-visible:outline-none"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
