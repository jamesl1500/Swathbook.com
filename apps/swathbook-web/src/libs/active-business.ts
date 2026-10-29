/**
 * active-business.ts
 *
 * Remembers which of a user's businesses the dashboard is showing. The cookie
 * is only a preference: every read re-checks membership.
 *
 * @module src/libs/active-business
 * @since 1.0.0
 */

export const ACTIVE_BUSINESS_COOKIE = "swathbook_business";

export const activeBusinessCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
};
