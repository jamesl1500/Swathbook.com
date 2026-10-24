import type { ReactNode } from "react";

export function AuthHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {icon ? (
        <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</span>
      ) : null}
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
      {description ? <p className="mt-2.5 leading-relaxed text-ink-soft">{description}</p> : null}
    </div>
  );
}
