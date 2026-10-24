import Form from "next/form";
import { routes } from "@/libs/routes";
import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/libs/globals/site";
import { cn } from "@/libs/utils";

/**
 * "swathbook.com/[your-name] → Claim it" form. Sends the slug to /signup, which
 * carries it through to onboarding.
 */
export function ClaimLinkForm({
  className,
  tone = "light",
  id = "claim-slug",
}: {
  className?: string;
  tone?: "light" | "dark";
  /** Unique per page when the form appears more than once. */
  id?: string;
}) {
  return (
    <Form
      action={routes.signup}
      className={cn(
        "flex w-full max-w-md items-center gap-1 rounded-full border p-1.5 pl-5 shadow-card",
        tone === "light" ? "border-line-strong bg-card" : "border-paper/20 bg-paper",
        className,
      )}
    >
      <label htmlFor={id} className="shrink-0 font-mono text-sm text-ink-faint">
        {siteConfig.bookingHost}/
      </label>
      <input
        id={id}
        name="slug"
        placeholder="yourbusiness"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        pattern="[A-Za-z0-9\-]{3,40}"
        title="3–40 letters, numbers or dashes"
        className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-5 text-sm font-semibold text-paper transition-colors hover:bg-brand-700"
      >
        Claim it
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </Form>
  );
}
