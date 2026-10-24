import type { ReactNode } from "react";
import { cn } from "@/libs/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("label-tag inline-flex items-center gap-2 text-brand-600", className)}>
      <span className="h-px w-6 bg-current" aria-hidden="true" />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-3xl font-bold leading-[1.08] sm:text-[2.6rem]">{title}</h2>
      {description ? <p className="mt-4 text-lg leading-relaxed text-ink-soft">{description}</p> : null}
    </div>
  );
}

/**
 * Hero block for the inner marketing pages. `aside` fills the right half on
 * wide screens; phones show the text alone.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  aside,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="map-grid-light absolute inset-0 opacity-70" aria-hidden="true" />
      <Container
        className={cn(
          "relative py-16 sm:py-24",
          aside ? "lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16" : null,
        )}
      >
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.02] sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">{description}</p>
          {children}
        </div>
        {aside ? <div className="hidden lg:block">{aside}</div> : null}
      </Container>
    </section>
  );
}
