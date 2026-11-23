/**
 * fees.ts
 *
 * How Swathbook makes money: 1.25% of each customer payment a business takes
 * through Swathbook (deposits and balances; tips go to the business in full),
 * on top of the monthly plan. The fee is a Stripe application fee on the
 * direct charge, so it comes out before the payout and is returned when a
 * payment is refunded.
 *
 * Card processing is separate: connected accounts pay Stripe's own pricing
 * (fees_collector: "stripe"), so take-home estimates subtract both.
 *
 * @module src/libs/billing/fees
 * @since 1.0.0
 */

/** Swathbook's fee in basis points (125 = 1.25%). */
export const SWATHBOOK_FEE_BPS = 125;

/** The fee as people read it. */
export const SWATHBOOK_FEE_LABEL = "1.25%";

/**
 * Stripe's standard US online card pricing, for estimates only. The real
 * processing fee depends on the card and country and is shown in Stripe.
 */
export const CARD_PROCESSING = { bps: 290, fixedCents: 30, label: "2.9% + 30¢" } as const;

function percentOf(amountCents: number, bps: number) {
    return Math.round((amountCents * bps) / 10_000);
}

/** Swathbook's cut of one customer payment, in cents. */
export function swathbookFeeCents(amountCents: number) {
    if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
    return Math.min(amountCents, percentOf(amountCents, SWATHBOOK_FEE_BPS));
}

/** Estimated card processing on one charge, in cents. */
export function cardProcessingCents(amountCents: number) {
    if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
    return Math.min(amountCents, percentOf(amountCents, CARD_PROCESSING.bps) + CARD_PROCESSING.fixedCents);
}

export type TakeHome = {
    priceCents: number;
    swathbookFeeCents: number;
    processingCents: number;
    takeHomeCents: number;
    /** Card charges the price is collected in (a deposit, then the balance). */
    charges: number;
};

/**
 * What the business keeps from a price paid by card, after Swathbook's fee
 * and estimated processing. A deposit smaller than the price means two
 * charges (deposit, then balance), so processing's fixed part counts twice.
 */
export function estimateTakeHome(priceCents: number, depositCents = 0): TakeHome {
    const price = Math.max(0, Math.round(priceCents));
    const deposit = Math.min(price, Math.max(0, Math.round(depositCents)));
    const parts = deposit > 0 && deposit < price ? [deposit, price - deposit] : price > 0 ? [price] : [];
    const fee = parts.reduce((sum, part) => sum + swathbookFeeCents(part), 0);
    const processing = parts.reduce((sum, part) => sum + cardProcessingCents(part), 0);
    return {
        priceCents: price,
        swathbookFeeCents: fee,
        processingCents: processing,
        takeHomeCents: Math.max(0, price - fee - processing),
        charges: parts.length,
    };
}

/** A service's deposit in cents, as private.service_deposit_cents() works it out. */
export function serviceDepositCents(service: {
    price_cents: number;
    deposit_type: string;
    deposit_percent: number | null;
    deposit_amount_cents: number | null;
}) {
    if (service.deposit_type === "percent") return Math.round((service.price_cents * (service.deposit_percent ?? 0)) / 100);
    if (service.deposit_type === "fixed") return Math.min(service.price_cents, service.deposit_amount_cents ?? 0);
    return 0;
}
