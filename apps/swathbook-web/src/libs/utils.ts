/**
 * utils.ts
 *
 * Small, dependency-free helpers shared across the application.
 *
 * @module src/libs/utils
 * @since 1.0.0
 */

/**
 * Joins class names, skipping falsy values.
 */
export function cn(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/**
 * Turns a business name into a booking link slug, e.g. "Shine On Detailing Co." -> "shine-on-detailing-co".
 */
export function slugify(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/g, "");
}

/**
 * Formats whole dollars as a price label, e.g. 45 -> "$45", 45.5 -> "$45.50".
 */
export function formatPrice(dollars: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    }).format(dollars);
}

/**
 * Formats a duration in minutes, e.g. 45 -> "45 min", 90 -> "1 hr 30 min".
 */
export function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/**
 * Formats cents as currency, e.g. 4550 -> "$45.50", 4500 -> "$45".
 */
export function formatCents(cents: number, currency = "usd") {
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    }).format(dollars);
}

const INK = "#14202e";

function relativeLuminance(hex: string) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const channels = [0, 2, 4].map((offset) => {
        const value = Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Text color for content on a business's brand color: white or ink, whichever
 * contrasts more (WCAG). Owners pick any color, including pale ones.
 */
export function brandTextColor(brand: string) {
    const luminance = relativeLuminance(brand);
    if (luminance === null) return "#ffffff";
    const inkLuminance = relativeLuminance(INK)!;
    const onWhite = 1.05 / (luminance + 0.05);
    const onInk = (luminance + 0.05) / (inkLuminance + 0.05);
    return onWhite >= onInk ? "#ffffff" : INK;
}

/** The brand color as text/icons on a white or paper background, or ink if it's too pale to read. */
export function brandOnLight(brand: string) {
    return brandTextColor(brand) === "#ffffff" ? brand : INK;
}
