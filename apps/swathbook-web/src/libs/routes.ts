/**
 * routes.ts
 *
 * Every app path in one place, so links, redirects and the proxy stay in sync.
 *
 * @module src/libs/routes
 * @since 1.0.0
 */

export const routes = {
    home: "/",
    features: "/features",
    industries: "/industries",
    pricing: "/pricing",
    about: "/about",
    contact: "/contact",
    terms: "/terms",
    privacy: "/privacy",

    login: "/auth/login",
    signup: "/auth/signup",
    forgotPassword: "/auth/forgot_password",
    resetPassword: "/auth/reset_password",
    verifyEmail: "/auth/verify_email",
    authConfirm: "/auth/confirm",

    onboarding: "/onboarding",
    addBusiness: "/onboarding?new=1",
    dashboard: "/dashboard",
    schedule: "/dashboard/schedule",
    bookings: "/dashboard/bookings",
    newBooking: "/dashboard/schedule/new",
    availability: "/dashboard/schedule/availability",
    customers: "/dashboard/customers",
    newCustomer: "/dashboard/customers/new",
    dayRoutes: "/dashboard/routes",
    services: "/dashboard/services",
    bookingLink: "/dashboard/link",
    payouts: "/dashboard/payouts",
    account: "/dashboard/account",
    billing: "/dashboard/billing",
    team: "/dashboard/team",
} as const;

/** Where an emailed team invite lands. */
export const invitePath = (token: string) => `/invite/${token}`;

export const bookingPath = (id: string) => `${routes.schedule}/${id}`;
export const customerPath = (id: string) => `${routes.customers}/${id}`;
/** The customer's own page for a booking (status, pay deposit/balance). */
export const customerBookingPath = (token: string) => `/booking/${token}`;
/** A business's public booking page. */
export const businessPagePath = (slug: string) => `/${slug}`;

/** Signed-out visitors are sent to log in. */
export const protectedPaths = [routes.onboarding, routes.dashboard];

/** Signed-in users skip straight past these. */
export const guestOnlyPaths = [routes.login, routes.signup, routes.forgotPassword];

export function matchesPath(pathname: string, paths: readonly string[]) {
    return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Returns `value` only if it's a same-site relative path, guarding `?next=` against open redirects.
 */
export function safeNextPath(value: unknown): string | null {
    if (typeof value !== "string" || !value.startsWith("/")) return null;
    if (value.startsWith("//") || value.startsWith("/\\")) return null;
    return value;
}
