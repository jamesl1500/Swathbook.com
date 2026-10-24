import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Database } from "@/libs/supabase/database.types";
import { cn } from "@/libs/utils";

/** Title row for a dashboard page. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="label-tag mb-2 text-ink-faint">{eyebrow}</p> : null}
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-[1.5rem] border border-line bg-card p-5 sm:p-6", className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-line-strong px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      {children ? <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Shown when crew open a page only owners and admins can use. */
export function ManagersOnly({ what }: { what: string }) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-card px-6 py-10 text-center">
      <h1 className="text-2xl font-bold">Owners and admins only</h1>
      <p className="mt-2 text-ink-soft">Ask the business owner if you need to change {what}.</p>
    </div>
  );
}

type BookingStatus = Database["public"]["Enums"]["booking_status"];

const statusStyles: Record<BookingStatus, { label: string; className: string }> = {
  pending_payment: { label: "Awaiting deposit", className: "bg-sun-soft text-ink" },
  requested: { label: "Requested", className: "bg-sun-soft text-ink" },
  confirmed: { label: "Confirmed", className: "bg-brand-50 text-brand-700" },
  in_progress: { label: "In progress", className: "bg-brand-600 text-paper" },
  completed: { label: "Completed", className: "bg-paper-deep text-ink-soft" },
  cancelled: { label: "Cancelled", className: "bg-clay-soft text-clay-ink" },
  no_show: { label: "No-show", className: "bg-clay-soft text-clay-ink" },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const style = statusStyles[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", style.className)}>
      {style.label}
    </span>
  );
}

export function bookingStatusLabel(status: BookingStatus) {
  return statusStyles[status].label;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[1.25rem] border border-line bg-card p-4 sm:p-5">
      <p className="label-tag text-ink-faint">{label}</p>
      <p className="mt-2 truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}
