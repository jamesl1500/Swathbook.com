"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { selectBusiness } from "@/app/dashboard/actions";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { cn } from "@/libs/utils";

type MenuBusiness = { id: string; name: string; slug: string; role: string };

export function BusinessMenu({ active, businesses }: { active: { id: string; name: string }; businesses: MenuBusiness[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="business-menu"
        className="inline-flex max-w-full items-center gap-2 sm:max-w-56 rounded-full border border-line bg-card px-3.5 py-2 text-sm font-semibold hover:border-ink-faint"
      >
        <span className="truncate">{active.name}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
        <span className="sr-only">Switch business</span>
      </button>

      {open ? (
        <div
          id="business-menu"
          role="menu"
          aria-label="Your businesses"
          className="absolute left-0 z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-2 shadow-lift"
        >
          <p className="label-tag px-3 pb-1 pt-2 text-ink-faint">Your businesses</p>
          <ul>
            {businesses.map((business) => (
              <li key={business.id}>
                <form action={selectBusiness}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <button
                    type="submit"
                    role="menuitemradio"
                    aria-checked={business.id === active.id}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-paper"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{business.name}</span>
                      <span className="block truncate font-mono text-xs text-ink-faint">
                        {siteConfig.bookingLinkPrefix}{business.slug}
                      </span>
                    </span>
                    {business.id === active.id ? (
                      <Check className="size-4 shrink-0 text-brand-500" aria-hidden="true" />
                    ) : null}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link
              href={routes.addBusiness}
              role="menuitem"
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-600 hover:bg-paper"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add a business
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
