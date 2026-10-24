/**
 * site.ts
 *
 * Site-wide configuration for the application
 *
 * @module src/libs/globals/site
 * @description Provides access to site-wide configuration for the application.
 * @since 1.0.0
 */

export const siteConfig = {
    // Basic App Information
    name: "Swathbook",
    legalName: "Swathbook LLC",
    supportEmail: "hello@swathbook.com",

    // SEO and Metadata
    description: "One link for field service businesses to show off their services, take bookings and deposits, get paid, and drive an AI-optimized route every day.",
    tagline: "Book the job. Get paid. Drive less.",
    keywords: ["scheduling", "booking page", "routes", "route optimization", "deposits", "payments", "customer management", "mobile detailing", "house cleaning", "landscaping", "lawn care", "plumbing", "pressure washing", "pool service", "mobile pet grooming", "handyman", "field services"],
    author: "Swathbook LLC",
    themeColor: "#f6f3ee",
    backgroundColor: "#f6f3ee",
    url: "https://www.swathbook.com",

    // Public booking links live at swathbook.com/<slug>
    bookingHost: "swathbook.com",
};
