import Link from "next/link";
import { cn } from "@/libs/utils";

/**
 * The Swathbook mark: a navy tile with a dotted route that ends at an orange
 * pin, i.e. the day's jobs, in order. Trade-neutral on purpose.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="var(--color-brand-600)" />
      <path
        d="M7.5 24.5c3.5 0 4-6 8-6s4.5-5.5 8-5.5"
        fill="none"
        stroke="var(--color-sky)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="0.1 4.2"
      />
      <circle cx="7.5" cy="24.5" r="2.4" fill="var(--color-paper)" />
      <path d="M23.5 4.5a5 5 0 0 1 5 5c0 3.6-5 8.5-5 8.5s-5-4.9-5-8.5a5 5 0 0 1 5-5Z" fill="var(--color-sun)" />
      <circle cx="23.5" cy="9.5" r="1.8" fill="var(--color-brand-600)" />
    </svg>
  );
}

export function Logo({
  className,
  tone = "ink",
  href = "/",
  wordmarkClassName,
}: {
  className?: string;
  tone?: "ink" | "paper";
  href?: string;
  wordmarkClassName?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Swathbook"
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-xl font-bold tracking-tight",
        tone === "ink" ? "text-ink" : "text-paper",
        className,
      )}
    >
      <LogoMark />
      <span className={wordmarkClassName}>Swathbook</span>
    </Link>
  );
}

/** Decorative orange map pin, the mark's accent at poster size. */
export function BrandPin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 12" aria-hidden="true" className={cn("pointer-events-none", className)}>
      <path d="M5 0a5 5 0 0 1 5 5c0 3.6-5 7-5 7s-5-3.4-5-7a5 5 0 0 1 5-5Z" fill="var(--color-sun)" />
      <circle cx="5" cy="5" r="1.9" fill="var(--color-brand-600)" />
    </svg>
  );
}
