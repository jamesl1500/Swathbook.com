/**
 * content.ts
 *
 * Copy and data that drives the marketing pages and onboarding suggestions.
 *
 * @module src/libs/marketing/content
 * @since 1.0.0
 */

import {
    BellRing,
    Bug,
    Car,
    CalendarCheck,
    Camera,
    CloudRain,
    CreditCard,
    Droplets,
    Fence,
    Flower2,
    Hammer,
    HandCoins,
    House,
    KeyRound,
    Leaf,
    Link2,
    MessageSquareText,
    Paintbrush,
    PawPrint,
    Receipt,
    Route,
    Satellite,
    Scissors,
    Smartphone,
    Snowflake,
    Sparkles,
    SprayCan,
    Trees,
    Users,
    Wrench,
    type LucideIcon,
} from "lucide-react";

export type SampleService = {
    name: string;
    /** Whole dollars. */
    price: number;
    durationMinutes: number;
    depositPercent: number;
};

export type Trade = {
    id: string;
    name: string;
    icon: LucideIcon;
    blurb: string;
    sampleServices: SampleService[];
};

export const trades: Trade[] = [
    // Mixed on purpose: the first few show up as examples, and no one trade should lead.
    {
        id: "mobile-detailing",
        name: "Mobile detailing",
        icon: Car,
        blurb: "Show off packages with clear prices, lock in deposits, and stack appointments by neighborhood.",
        sampleServices: [
            { name: "Express wash & vacuum", price: 75, durationMinutes: 60, depositPercent: 20 },
            { name: "Full interior detail", price: 180, durationMinutes: 180, depositPercent: 25 },
            { name: "Ceramic coating", price: 650, durationMinutes: 360, depositPercent: 50 },
        ],
    },
    {
        id: "house-cleaning",
        name: "House cleaning",
        icon: Sparkles,
        blurb: "Recurring cleans, move-outs and deep cleans with deposits that protect your time.",
        sampleServices: [
            { name: "Standard clean", price: 140, durationMinutes: 120, depositPercent: 20 },
            { name: "Deep clean", price: 260, durationMinutes: 240, depositPercent: 25 },
            { name: "Move-out clean", price: 320, durationMinutes: 300, depositPercent: 30 },
        ],
    },
    {
        id: "lawn-care",
        name: "Lawn mowing",
        icon: Scissors,
        blurb: "Weekly and bi-weekly cuts on autopilot, with the route already planned when you pull out of the driveway.",
        sampleServices: [
            { name: "Weekly mow, edge & blow", price: 45, durationMinutes: 45, depositPercent: 0 },
            { name: "One-time cut", price: 65, durationMinutes: 60, depositPercent: 20 },
            { name: "Overgrown yard reset", price: 150, durationMinutes: 120, depositPercent: 25 },
        ],
    },
    {
        id: "plumbing",
        name: "Plumbing",
        icon: Wrench,
        blurb: "Take a service-call fee when the job is booked and stop driving across town for no-shows.",
        sampleServices: [
            { name: "Service call & diagnosis", price: 89, durationMinutes: 60, depositPercent: 100 },
            { name: "Faucet or fixture install", price: 175, durationMinutes: 90, depositPercent: 25 },
            { name: "Water heater flush", price: 140, durationMinutes: 60, depositPercent: 20 },
        ],
    },
    {
        id: "pressure-washing",
        name: "Pressure washing",
        icon: SprayCan,
        blurb: "Driveways, decks and siding, all priced, booked and paid before you uncoil a hose.",
        sampleServices: [
            { name: "Driveway & walkway", price: 150, durationMinutes: 90, depositPercent: 20 },
            { name: "House wash (single story)", price: 300, durationMinutes: 180, depositPercent: 25 },
            { name: "Deck or patio refresh", price: 200, durationMinutes: 120, depositPercent: 25 },
        ],
    },
    {
        id: "landscaping",
        name: "Landscaping",
        icon: Trees,
        blurb: "Quote, book and collect a deposit on bigger installs before you ever load the trailer.",
        sampleServices: [
            { name: "Mulch install (per yard)", price: 95, durationMinutes: 90, depositPercent: 25 },
            { name: "Shrub & hedge trimming", price: 120, durationMinutes: 120, depositPercent: 20 },
            { name: "Seasonal bed cleanup", price: 180, durationMinutes: 180, depositPercent: 25 },
        ],
    },
    {
        id: "pool-service",
        name: "Pool service",
        icon: Droplets,
        blurb: "Recurring weekly visits mapped into the tightest loop, so more of the day goes to pools and less to traffic.",
        sampleServices: [
            { name: "Weekly pool maintenance", price: 120, durationMinutes: 45, depositPercent: 0 },
            { name: "Green-to-clean recovery", price: 350, durationMinutes: 180, depositPercent: 50 },
            { name: "Filter clean", price: 95, durationMinutes: 60, depositPercent: 0 },
        ],
    },
    {
        id: "handyman",
        name: "Handyman",
        icon: Hammer,
        blurb: "Turn a long list of small jobs into a clean booking menu with time blocks you control.",
        sampleServices: [
            { name: "Handyman hour", price: 85, durationMinutes: 60, depositPercent: 20 },
            { name: "TV or shelf mounting", price: 120, durationMinutes: 60, depositPercent: 20 },
            { name: "Half-day block", price: 320, durationMinutes: 240, depositPercent: 25 },
        ],
    },
    {
        id: "mobile-pet-grooming",
        name: "Mobile pet grooming",
        icon: PawPrint,
        blurb: "Pet parents book the van, pay ahead, and get a heads-up when you're on the way.",
        sampleServices: [
            { name: "Bath & brush", price: 70, durationMinutes: 60, depositPercent: 20 },
            { name: "Full groom", price: 110, durationMinutes: 90, depositPercent: 20 },
            { name: "Nail trim", price: 25, durationMinutes: 15, depositPercent: 0 },
        ],
    },
    {
        id: "leaf-cleanup",
        name: "Leaf cleanup",
        icon: Leaf,
        blurb: "Fill the fall rush fast. Customers grab open slots themselves and pay up front.",
        sampleServices: [
            { name: "Leaf cleanup, small yard", price: 120, durationMinutes: 90, depositPercent: 20 },
            { name: "Leaf cleanup, large yard", price: 240, durationMinutes: 180, depositPercent: 25 },
            { name: "Gutter clear-out", price: 110, durationMinutes: 60, depositPercent: 0 },
        ],
    },
    {
        id: "pest-control",
        name: "Pest control",
        icon: Bug,
        blurb: "Quarterly plans, one-off treatments and reminders that keep customers on schedule.",
        sampleServices: [
            { name: "General pest treatment", price: 129, durationMinutes: 45, depositPercent: 0 },
            { name: "Mosquito yard spray", price: 85, durationMinutes: 30, depositPercent: 0 },
            { name: "Termite inspection", price: 99, durationMinutes: 60, depositPercent: 100 },
        ],
    },
    {
        id: "painting",
        name: "Painting",
        icon: Paintbrush,
        blurb: "Collect deposits for materials up front and keep every estimate tied to a customer.",
        sampleServices: [
            { name: "Interior room", price: 450, durationMinutes: 480, depositPercent: 30 },
            { name: "Fence or deck stain", price: 600, durationMinutes: 480, depositPercent: 30 },
            { name: "Estimate visit", price: 0, durationMinutes: 30, depositPercent: 0 },
        ],
    },
    {
        id: "fencing",
        name: "Fencing",
        icon: Fence,
        blurb: "Book estimate visits and repair calls without the phone tag.",
        sampleServices: [
            { name: "Estimate visit", price: 0, durationMinutes: 45, depositPercent: 0 },
            { name: "Fence repair", price: 180, durationMinutes: 120, depositPercent: 25 },
            { name: "Gate install", price: 450, durationMinutes: 240, depositPercent: 30 },
        ],
    },
    {
        id: "snow-removal",
        name: "Snow removal",
        icon: Snowflake,
        blurb: "Sell seasonal contracts ahead of time and run the storm-day route in the best order.",
        sampleServices: [
            { name: "Driveway plow (per visit)", price: 60, durationMinutes: 30, depositPercent: 0 },
            { name: "Walkway shovel & salt", price: 40, durationMinutes: 30, depositPercent: 0 },
            { name: "Seasonal contract", price: 600, durationMinutes: 30, depositPercent: 50 },
        ],
    },
    {
        id: "other",
        name: "Something else",
        icon: Flower2,
        blurb: "If you drive to your customers, Swathbook fits. Set up whatever services you offer.",
        sampleServices: [{ name: "Standard visit", price: 100, durationMinutes: 60, depositPercent: 20 }],
    },
];

export function findTrade(id: string | undefined) {
    return trades.find((trade) => trade.id === id);
}

export type Feature = {
    icon: LucideIcon;
    title: string;
    body: string;
};

/** The four promises, in the order customers experience them. */
export const pillars: Array<Feature & { kicker: string; points: string[] }> = [
    {
        kicker: "Your link",
        icon: Link2,
        title: "A booking page that sells for you",
        body: "Every business gets its own link with your services, prices, photos and service area. Put it in your truck wrap, your Google profile, your texts.",
        points: ["Clear service menu with prices", "Only shows times you actually have open", "Looks great on any phone"],
    },
    {
        kicker: "Deposits",
        icon: HandCoins,
        title: "Deposits that stop no-shows",
        body: "Ask for a percentage or a flat fee when a customer books. They're committed before you ever start the truck.",
        points: ["Set a deposit per service", "Refund or keep on cancellation, your rules", "Money lands in your bank account"],
    },
    {
        kicker: "Payments",
        icon: CreditCard,
        title: "Get paid before you leave the driveway",
        body: "Send the final bill the moment the job's done. Customers pay by card from their phone, and the deposit is already subtracted.",
        points: ["Card and wallet payments", "Automatic receipts", "See what's paid and what's owed"],
    },
    {
        kicker: "AI routing",
        icon: Route,
        title: "A smarter route, every morning",
        body: "Swathbook looks at every stop, time window and drive time, then lines up your day in the order that wastes the least road.",
        points: ["Re-plans when a job moves", "Respects customer time windows", "One tap to start navigation"],
    },
];

export const supportingFeatures: Feature[] = [
    {
        icon: CalendarCheck,
        title: "Real availability",
        body: "Set working days and hours once. Customers only see openings that fit your schedule and route.",
    },
    {
        icon: Users,
        title: "Customer book",
        body: "Every customer, address, gate code, pet and job history in one place, with no more scrolling through texts.",
    },
    {
        icon: BellRing,
        title: "Automatic reminders",
        body: "Booking confirmations, deposit nudges and day-before reminders go out by email without you lifting a finger.",
    },
    {
        icon: Receipt,
        title: "Clean records",
        body: "Every deposit, payment and refund tracked per job, ready for tax time.",
    },
    {
        icon: MessageSquareText,
        title: "Job notes",
        body: "Leave notes and photos on any job so the next visit (or the next crew member) knows what's up.",
    },
    {
        icon: Smartphone,
        title: "Run it from your phone",
        body: "Everything works from the cab of your truck. No laptop required.",
    },
];

/** What sets Swathbook apart, each with an anchor on the features page. */
export const standoutFeatures: Array<Feature & { id: string }> = [
    {
        id: "satellite-quotes",
        icon: Satellite,
        title: "Instant quotes from a satellite photo",
        body: "Customers outline their lawn, driveway or roof on a satellite photo and see your per-square-foot price before they book. No drive-by estimates.",
    },
    {
        id: "neighbor-pricing",
        icon: House,
        title: "Neighbor pricing",
        body: "Offer a discount on days you already have a job nearby. Customers fill the gaps in your route, and you spend less time driving between stops.",
    },
    {
        id: "job-reports",
        icon: Camera,
        title: "Job reports with before and after photos",
        body: "After every job, customers get a branded report with your photos and notes, a link to pay what's left, a tip button and a nudge to leave a review.",
    },
    {
        id: "rain-days",
        icon: CloudRain,
        title: "Rain-day rescheduling",
        body: "When rain is forecast, move a whole day's outdoor jobs in a couple of taps. Swathbook finds the new times and emails every customer for you.",
    },
    {
        id: "property-notes",
        icon: KeyRound,
        title: "Property notes for crews",
        body: "Gate codes, pets and a pinned map of hazards, spigots and sprinkler heads, saved with the address so every crew member arrives knowing the yard.",
    },
];

/** "Instead of juggling…" comparison on the landing page. */
export const patchwork = [
    { before: "Phone tag and texting back and forth to set a time", after: "Customers pick an open slot from your link" },
    { before: "Chasing no-shows that cost you the morning", after: "Deposits collected when the job is booked" },
    { before: "Paper invoices and \"I'll pay you next week\"", after: "Card payments the moment the job's done" },
    { before: "Guessing the order of your stops", after: "An AI-planned route that cuts the backtracking" },
];

/**
 * Swathbook's one price: a share of what the business is paid through it.
 * The rate itself lives in libs/billing/fees.ts, which the charges use too.
 */
export const pricingOffer = {
    name: "Pay as you get paid",
    description: "One price for every business, from one truck to a fleet.",
    features: [
        "Your own booking link",
        "Unlimited services, bookings and customers",
        "Deposits and card payments",
        "AI route planning for every driver",
        "Unlimited team members",
        "Email confirmations & reminders",
        "Tips go to you in full",
    ],
    cta: "Get your link",
};

export const faqs = [
    {
        question: "Do my customers need an account to book?",
        answer: "No. They open your link, pick a service and time, enter their address and pay any deposit. That's it.",
    },
    {
        question: "How do I get paid?",
        answer: "Deposits and payments go through our payment partner straight to your bank account. You connect your account once during setup, and payouts arrive on a regular schedule.",
    },
    {
        question: "How does the AI route planning work?",
        answer: "Each day, Swathbook looks at your booked jobs, their addresses, how long each takes, and any time windows customers picked, then orders your stops to minimize drive time. If a job moves, the route updates.",
    },
    {
        question: "Can customers get a price without a site visit?",
        answer: "Yes. For services you price by the square foot, customers outline the area on a satellite photo of their property while booking and see the price right away.",
    },
    {
        question: "What happens when it rains?",
        answer: "Swathbook checks the forecast for your service area and warns you about rainy days ahead. Pick the day, choose where the outdoor jobs should go, and every customer gets an email with their new time.",
    },
    {
        question: "Which trades is Swathbook for?",
        answer: "Any business that drives to its customers: mobile detailers, cleaners, landscapers and lawn care, plumbers, pool techs, groomers, handymen, pest control and more. Pick your trade at setup for a starter menu, or build your own.",
    },
    {
        question: "How long does setup take?",
        answer: "Most businesses have a live booking link in about five minutes. Pick your trade, and we'll suggest starter services you can tweak.",
    },
    {
        question: "What does Swathbook cost?",
        answer: "1.25% of the payments you take through your booking page, and nothing else: no monthly fee, no setup fee, no contract. If a job is paid in cash, or you're not taking bookings, you pay nothing.",
    },
];
