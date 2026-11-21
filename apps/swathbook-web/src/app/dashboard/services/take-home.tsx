import { CARD_PROCESSING, SWATHBOOK_FEE_LABEL, estimateTakeHome, serviceDepositCents } from "@/libs/billing/fees";
import { dollarsToCents } from "@/libs/forms";
import { cn, formatCents } from "@/libs/utils";

/** The part of a service the take-home estimate needs. */
export type PriceDraft = { priceCents: number; priceType: string; depositCents: number };

/** Percent the deposit picker starts on, before the owner touches it. */
const DEFAULT_DEPOSIT_PERCENT = 25;

export function draftFromService(
  service?: {
    price_cents: number;
    price_type: string;
    price_per_1000_sqft_cents: number | null;
    deposit_type: string;
    deposit_percent: number | null;
    deposit_amount_cents: number | null;
  } | null,
): PriceDraft {
  if (!service) return { priceCents: 0, priceType: "fixed", depositCents: 0 };
  return {
    priceCents: service.price_cents,
    // By-the-foot services start at their minimum.
    priceType: service.price_per_1000_sqft_cents ? "starting_at" : service.price_type,
    depositCents: serviceDepositCents(service),
  };
}

function cents(value: FormDataEntryValue | null) {
  const parsed = dollarsToCents.safeParse(typeof value === "string" ? value : "");
  return parsed.success ? parsed.data : 0;
}

/** Reads the service form as it is right now, mid-edit. */
export function draftFromForm(form: HTMLFormElement): PriceDraft {
  const data = new FormData(form);
  const priceCents = cents(data.get("price"));
  const priceType = data.get("byArea") === "on" ? "starting_at" : String(data.get("priceType") ?? "fixed");
  const depositType = String(data.get("depositType") ?? "none");
  // The percent picker may not be on screen yet in the same tick its radio is picked.
  const percent = Number(data.get("depositPercent") ?? DEFAULT_DEPOSIT_PERCENT);
  const depositCents = serviceDepositCents({
    price_cents: priceCents,
    deposit_type: depositType,
    deposit_percent: Number.isFinite(percent) ? percent : DEFAULT_DEPOSIT_PERCENT,
    deposit_amount_cents: cents(data.get("depositAmount")),
  });
  return { priceCents, priceType, depositCents };
}

/**
 * What the business keeps from a service paid by card, after Swathbook's
 * 1.25% and estimated card processing. Nothing for quotes or free services.
 */
export function TakeHome({ draft, currency, className, compact }: { draft: PriceDraft; currency: string; className?: string; compact?: boolean }) {
  if (draft.priceType === "quote" || draft.priceCents <= 0) return null;
  const estimate = estimateTakeHome(draft.priceCents, draft.depositCents);
  const fees = `Swathbook ${SWATHBOOK_FEE_LABEL} ${formatCents(estimate.swathbookFeeCents, currency)} · card processing about ${formatCents(estimate.processingCents, currency)}`;
  return (
    <p className={cn("text-sm text-ink-soft", className)} data-testid="take-home">
      You keep about <strong className="text-brand-700">{formatCents(estimate.takeHomeCents, currency)}</strong>
      {draft.priceType === "starting_at" ? " at the starting price" : ""} after fees
      <span className="block text-xs text-ink-faint">
        {fees}
        {estimate.charges > 1 ? " (deposit and balance charged separately)" : ""}
        {compact ? null : <>. Processing is Stripe&apos;s ({CARD_PROCESSING.label} on most US cards); cash payments have no fees.</>}
      </span>
    </p>
  );
}
