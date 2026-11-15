"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { cn } from "@/libs/utils";

export type MenuAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Navigate (in-app path, tel:, mailto:) instead of running onSelect. */
  href?: string;
  onSelect?: () => void;
  /** Destructive: shown last, in red, set apart. */
  danger?: boolean;
};

/**
 * A "More actions" menu: a button that opens a short list of actions.
 * Keyboard: arrows move, Home/End jump, Escape closes and returns focus.
 * Closes on a click outside. Destructive actions go last, set apart.
 */
export function ActionMenu({
  label,
  actions,
  disabled,
  showText = false,
  align = "right",
}: {
  /** Names the menu for screen readers, e.g. "More actions for Pat". */
  label: string;
  actions: MenuAction[];
  disabled?: boolean;
  /** Show "More" next to the icon (for page headers); icon-only otherwise. */
  showText?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const ordered = [...actions.filter((action) => !action.danger), ...actions.filter((action) => action.danger)];

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    wrapper.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!actions.length) return null;

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = [...(wrapper.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 };
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key in move) {
      event.preventDefault();
      items[(move[event.key] + items.length) % items.length]?.focus();
    }
  }

  const itemClass = (danger?: boolean) =>
    cn(
      "flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 text-left text-sm font-semibold focus:outline-none",
      danger ? "text-clay hover:bg-clay-soft focus:bg-clay-soft" : "text-ink hover:bg-paper focus:bg-paper",
    );

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line-strong bg-card font-semibold text-ink-soft hover:border-ink-soft hover:text-ink disabled:opacity-50",
          showText ? "px-4 text-[0.95rem]" : "size-11",
        )}
      >
        <Ellipsis className="size-5" aria-hidden="true" />
        {showText ? <span aria-hidden="true">More</span> : null}
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute top-full z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-card py-1.5 shadow-lift",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {ordered.map((action, index) => {
            const content = (
              <>
                <action.icon className={cn("size-4", action.danger ? "" : "text-ink-faint")} aria-hidden="true" />
                {action.label}
              </>
            );
            const separated = action.danger && index > 0 && !ordered[index - 1].danger;
            return (
              <li key={action.key} role="none" className={separated ? "mt-1.5 border-t border-line pt-1.5" : undefined}>
                {action.href?.startsWith("/") ? (
                  <Link href={action.href} role="menuitem" tabIndex={-1} className={itemClass(action.danger)} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : action.href ? (
                  <a href={action.href} role="menuitem" tabIndex={-1} className={itemClass(action.danger)} onClick={() => setOpen(false)}>
                    {content}
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={itemClass(action.danger)}
                    onClick={() => {
                      setOpen(false);
                      action.onSelect?.();
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
