/**
 * directory.ts
 *
 * Copy for the public business directory (/businesses and
 * /businesses/<trade>). Written for customers looking for someone to hire;
 * the trade blurbs in content.ts speak to the business owner instead.
 *
 * @module src/libs/marketing/directory
 * @since 1.0.0
 */

import { trades } from "./content";

export type DirectoryTrade = {
    /** businesses.trade, and the URL segment: /businesses/<id>. */
    id: string;
    /** "Lawn mowing": as in content.ts. */
    name: string;
    /** H1 and title: "Lawn mowing services". */
    heading: string;
    /** "lawn care pro", for sentences like "Find a lawn care pro". */
    pro: string;
    /** Opening paragraph: what you can book, in plain words. */
    intro: string;
    /** What people typically book, for the copy and the search snippet. */
    examples: string[];
};

const copy: Record<string, Omit<DirectoryTrade, "id" | "name">> = {
    "mobile-detailing": {
        heading: "Mobile car detailing",
        pro: "mobile detailer",
        intro: "Detailers who come to your driveway or office: washes, interior details and paint protection, with prices up front and a time you pick.",
        examples: ["exterior wash", "interior detail", "ceramic coating"],
    },
    "house-cleaning": {
        heading: "House cleaning services",
        pro: "house cleaner",
        intro: "Local cleaners for regular, deep and move-out cleans. See what each visit costs, choose a day, and book without a phone call.",
        examples: ["standard clean", "deep clean", "move-out clean"],
    },
    "lawn-care": {
        heading: "Lawn mowing services",
        pro: "lawn care pro",
        intro: "Weekly mows, one-time cuts and overgrown-yard resets from local lawn care pros. Compare prices and book the next open time online.",
        examples: ["weekly mow", "one-time cut", "edging and cleanup"],
    },
    plumbing: {
        heading: "Plumbers",
        pro: "plumber",
        intro: "Local plumbers for service calls, fixture installs and water heater work. Book a visit online and know the call-out price before anyone arrives.",
        examples: ["service call", "faucet install", "water heater flush"],
    },
    "pressure-washing": {
        heading: "Pressure washing services",
        pro: "pressure washing pro",
        intro: "Driveways, siding, decks and patios cleaned by local pressure washing pros. Pick the job, see the price, and choose a time that suits you.",
        examples: ["driveway cleaning", "house wash", "deck refresh"],
    },
    landscaping: {
        heading: "Landscaping services",
        pro: "landscaper",
        intro: "Mulch, trimming and seasonal bed cleanups from local landscapers, bookable online with clear prices.",
        examples: ["mulch install", "hedge trimming", "bed cleanup"],
    },
    "pool-service": {
        heading: "Pool cleaning and service",
        pro: "pool tech",
        intro: "Weekly maintenance, green-to-clean recoveries and filter cleans from local pool techs. Book online and skip the phone tag.",
        examples: ["weekly pool service", "green pool recovery", "filter clean"],
    },
    handyman: {
        heading: "Handyman services",
        pro: "handyman",
        intro: "Small repairs, mounting and odd jobs from local handymen. Book by the hour or by the job, at a time you choose.",
        examples: ["handyman hour", "TV mounting", "small repairs"],
    },
    "mobile-pet-grooming": {
        heading: "Mobile pet grooming",
        pro: "mobile groomer",
        intro: "Groomers who bring the salon to your door: baths, haircuts and nail trims, booked online with the price shown up front.",
        examples: ["bath and brush", "full groom", "nail trim"],
    },
    "leaf-cleanup": {
        heading: "Leaf removal and yard cleanup",
        pro: "yard cleanup crew",
        intro: "Fall leaf removal and yard cleanups from local crews. See prices, pick a day, and book before the season fills up.",
        examples: ["leaf removal", "gutter clearing", "yard cleanup"],
    },
    "pest-control": {
        heading: "Pest control services",
        pro: "pest control pro",
        intro: "Inspections, treatments and recurring service from local pest control pros, bookable online.",
        examples: ["pest inspection", "general treatment", "quarterly service"],
    },
    painting: {
        heading: "House painters",
        pro: "painter",
        intro: "Interior and exterior painters for a room, a fence or the whole house. Book an estimate or a job online.",
        examples: ["room painting", "exterior painting", "estimate visit"],
    },
    fencing: {
        heading: "Fence installation and repair",
        pro: "fence contractor",
        intro: "Local fence pros for repairs, new runs and gates. Book an estimate visit or a repair online.",
        examples: ["fence repair", "new fence estimate", "gate install"],
    },
    "snow-removal": {
        heading: "Snow removal services",
        pro: "snow removal crew",
        intro: "Driveway plowing, walkway shoveling and seasonal contracts from local snow removal crews.",
        examples: ["driveway plowing", "walkway shoveling", "seasonal contract"],
    },
    other: {
        heading: "More local services",
        pro: "local pro",
        intro: "Other local businesses that come to you, all bookable online with prices shown up front.",
        examples: [],
    },
};

/** Every trade with directory copy, in the order content.ts lists them. */
export const directoryTrades: DirectoryTrade[] = trades
    .filter((trade) => copy[trade.id])
    .map((trade) => ({ id: trade.id, name: trade.id === "other" ? "Other services" : trade.name, ...copy[trade.id] }));

export function findDirectoryTrade(id: string | null | undefined) {
    return directoryTrades.find((trade) => trade.id === id) ?? null;
}

/** Questions every directory page answers, phrased for that trade. Also published as FAQPage data. */
export function directoryFaqs(trade: DirectoryTrade | null) {
    const pro = trade?.pro ?? "local pro";
    return [
        {
            question: `How do I book a ${pro} on Swathbook?`,
            answer: `Open a business's page, pick the services you need, choose one of their open times and enter your address. You'll get an email confirmation with a link to manage the booking.`,
        },
        {
            question: "Do I have to pay when I book?",
            answer: "Some businesses ask for a deposit to hold your time; it's shown before you book. Everything else is paid to the business after the job.",
        },
        {
            question: "Can I reschedule or cancel?",
            answer: "Yes. Use the link in your confirmation email, or sign in to your Swathbook account with the same email to see every booking and move or cancel it, within each business's policy.",
        },
        {
            question: "Do I need an account?",
            answer: "No. You can book with just your name, email and address. Signing in later with that email shows all your bookings in one place.",
        },
    ];
}
