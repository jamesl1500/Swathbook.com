import Link from "next/link";
import { routes } from "@/libs/routes";
import { Check } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { pricingTiers } from "@/libs/marketing/content";
import { cn } from "@/libs/utils";

export function PricingCards() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {pricingTiers.map((tier) => (
        <div
          key={tier.name}
          className={cn(
            "relative flex flex-col rounded-[1.75rem] border p-7",
            tier.highlighted ? "border-brand-700 bg-brand-700 text-paper shadow-lift" : "border-line bg-card",
          )}
        >
          {tier.highlighted ? (
            <span className="label-tag absolute -top-3 left-7 rounded-full bg-sun px-3 py-1 text-ink">
              Most popular
            </span>
          ) : null}
          <h3 className="font-display text-xl font-bold">{tier.name}</h3>
          <p className={cn("mt-1 text-sm", tier.highlighted ? "text-paper/70" : "text-ink-soft")}>
            {tier.description}
          </p>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="font-display text-5xl font-extrabold tracking-tight">{tier.price}</span>
            {tier.cadence ? (
              <span className={cn("text-sm", tier.highlighted ? "text-paper/70" : "text-ink-faint")}>
                {tier.cadence}
              </span>
            ) : null}
          </p>
          <ul className="mt-6 flex-1 space-y-3 text-[0.95rem]">
            {tier.features.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <Check
                  className={cn("mt-0.5 size-4 shrink-0", tier.highlighted ? "text-sky" : "text-brand-500")}
                  aria-hidden="true"
                />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href={tier.cta === "Contact sales" ? routes.contact : routes.signup}
            className={buttonStyles({
              variant: tier.highlighted ? "accent" : "secondary",
              className: "mt-8 w-full",
            })}
          >
            {tier.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}
