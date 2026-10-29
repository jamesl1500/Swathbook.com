import type { ComponentProps } from "react";
import { cn } from "@/libs/utils";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "inverse" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-60 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-paper shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-brand-700",
  accent: "bg-sun text-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] hover:bg-[#eaa82a]",
  secondary: "border border-line-strong bg-card text-ink hover:border-ink-soft hover:bg-white",
  ghost: "text-ink-soft hover:bg-paper-deep hover:text-ink",
  inverse: "bg-paper text-brand-700 hover:bg-white",
  danger: "bg-clay text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-[#9a3a17]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-7 text-base",
};

/**
 * Class names for a button-styled element. Use with `<Link>` to render links as buttons.
 */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
