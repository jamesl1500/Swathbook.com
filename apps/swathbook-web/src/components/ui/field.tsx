import type { ComponentProps, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/libs/utils";

export const inputStyles =
  "block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[0.95rem] text-ink shadow-[inset_0_1px_2px_rgb(20_38_27/0.06)] transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200 aria-invalid:border-clay aria-invalid:focus:ring-clay-soft disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputStyles, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputStyles, "appearance-auto pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-semibold text-ink", className)} {...props} />;
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-sm text-clay" role="alert">
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/**
 * Label + control + hint/error, laid out consistently.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  action,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {action}
      </div>
      {children}
      {hint && !error ? <p className="mt-1.5 text-sm text-ink-faint">{hint}</p> : null}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  );
}

/**
 * Inline status banner for form-level errors and confirmations.
 */
export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "error" && "border-clay/40 bg-clay-soft text-clay-ink",
        tone === "success" && "border-brand-200 bg-brand-50 text-brand-700",
        tone === "info" && "border-sun/50 bg-sun-soft text-ink",
      )}
    >
      {children}
    </div>
  );
}
