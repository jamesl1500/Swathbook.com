/**
 * pricing.ts
 *
 * What a booking costs before it's made, for the booking page's running
 * total. Mirrors the database exactly (private.service_line_price,
 * service_line_minutes, service_line_deposit and the neighbor discount in
 * create_booking); the database stays the source of truth for the real
 * booking.
 *
 * @module src/libs/pricing
 * @since 1.0.0
 */

export type PricedService = {
    id: string;
    name: string;
    price_type: "fixed" | "starting_at" | "quote";
    price_cents: number;
    duration_minutes: number;
    /** Set when the service is priced by area; price_cents is then the minimum. */
    price_per_1000_sqft_cents?: number | null;
    minutes_per_1000_sqft?: number | null;
    /** The deposit at price_cents, as the server worked it out (0 without online payments). */
    deposit_cents?: number;
    deposit_type?: "none" | "percent" | "fixed";
    deposit_percent?: number;
    deposit_amount_cents?: number;
};

export function isMeasured(service: Pick<PricedService, "price_per_1000_sqft_cents">) {
    return service.price_per_1000_sqft_cents != null && service.price_per_1000_sqft_cents > 0;
}

/** Postgres round() takes halves away from zero; for the positive amounts here that's Math.round. */
const round = Math.round;

export function linePriceCents(service: PricedService, areaSqft: number | null) {
    if (!isMeasured(service) || areaSqft == null) return service.price_cents;
    return Math.min(10_000_000, Math.max(service.price_cents, round((areaSqft * service.price_per_1000_sqft_cents!) / 1000)));
}

export function lineMinutes(service: PricedService, areaSqft: number | null) {
    if (service.minutes_per_1000_sqft == null || !isMeasured(service) || areaSqft == null) return service.duration_minutes;
    const scaled = Math.ceil((areaSqft * service.minutes_per_1000_sqft) / 1000 / 5) * 5;
    return Math.min(1440, Math.max(service.duration_minutes, scaled));
}

export function lineDepositCents(service: PricedService, priceCents: number) {
    // At the service's own price, the server's figure is the one to show.
    if (priceCents === service.price_cents && service.deposit_cents != null) return service.deposit_cents;
    if (service.deposit_type === "percent") return round((priceCents * (service.deposit_percent ?? 0)) / 100);
    if (service.deposit_type === "fixed") return Math.min(service.deposit_amount_cents ?? 0, priceCents);
    return 0;
}

export type BookingQuote = {
    lines: Array<{ id: string; name: string; priceCents: number; minutes: number; isQuote: boolean; isMinimum: boolean }>;
    minutes: number;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    depositCents: number;
};

export function quoteBooking(
    services: PricedService[],
    { areaSqft = null, neighborPercent = 0, acceptsPayments = true }: { areaSqft?: number | null; neighborPercent?: number; acceptsPayments?: boolean } = {},
): BookingQuote {
    const lines = services.map((service) => {
        const priceCents = linePriceCents(service, areaSqft);
        return {
            id: service.id,
            name: service.name,
            priceCents,
            minutes: lineMinutes(service, areaSqft),
            isQuote: service.price_type === "quote",
            // Priced by area but not measured yet: the price is only the starting point.
            isMinimum: isMeasured(service) && areaSqft == null,
            deposit: lineDepositCents(service, priceCents),
        };
    });
    const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents, 0);
    const discountCents = neighborPercent > 0 && subtotalCents > 0 ? round((subtotalCents * neighborPercent) / 100) : 0;
    const rawDeposit = acceptsPayments ? lines.reduce((sum, line) => sum + line.deposit, 0) : 0;
    const depositCents = neighborPercent > 0 ? round((rawDeposit * (100 - neighborPercent)) / 100) : rawDeposit;
    return {
        lines: lines.map(({ id, name, priceCents, minutes, isQuote, isMinimum }) => ({ id, name, priceCents, minutes, isQuote, isMinimum })),
        minutes: lines.reduce((sum, line) => sum + line.minutes, 0),
        subtotalCents,
        discountCents,
        totalCents: subtotalCents - discountCents,
        depositCents,
    };
}
