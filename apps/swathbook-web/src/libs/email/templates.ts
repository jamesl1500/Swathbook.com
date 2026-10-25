/**
 * templates.ts
 *
 * Every transactional email's words. Templates get fresh booking data at send
 * time (not when queued), so a reschedule between queueing and sending never
 * produces a stale email.
 *
 * @module src/libs/email/templates
 * @since 1.0.0
 */

import { siteConfig } from "@/libs/globals/site";
import { formatDateLong, formatTime, toDateKey } from "@/libs/time";
import { formatCents } from "@/libs/utils";
import { renderEmail, type EmailContent } from "./layout";

export type BookingEmailContext = {
    baseUrl: string;
    business: {
        name: string;
        slug: string;
        brandColor: string | null;
        timezone: string;
        phone: string | null;
        email: string | null;
        cancellationWindowHours: number;
    };
    /** First name for customer greetings; full name for owner emails. */
    customer: { name: string; fullName: string };
    booking: {
        id: string;
        reference: string;
        publicToken: string;
        start: string;
        end: string;
        currency: string;
        totalCents: number;
        depositDueCents: number;
        depositPaidCents: number;
        holdExpiresAt: string | null;
        cancellationReason: string | null;
    };
    services: string[];
    address: string | null;
    /** From the queued row, e.g. the previous start for a reschedule. */
    payload: Record<string, unknown>;
};

export type RenderedEmail = { subject: string; html: string; text: string; replyTo?: string };

function when(context: BookingEmailContext, iso = context.booking.start) {
    const tz = context.business.timezone;
    return `${formatDateLong(toDateKey(new Date(iso), tz))} at ${formatTime(iso, tz)}`;
}

function money(context: BookingEmailContext, cents: number) {
    return formatCents(cents, context.booking.currency);
}

function bookingDetails(context: BookingEmailContext) {
    const rows = [
        { label: "When", value: `${when(context)} – ${formatTime(context.booking.end, context.business.timezone)}` },
        { label: "Services", value: context.services.join(", ") || "Service visit" },
    ];
    if (context.address) rows.push({ label: "Where", value: context.address });
    if (context.booking.totalCents > 0) rows.push({ label: "Total", value: money(context, context.booking.totalCents) });
    if (context.booking.depositPaidCents > 0) rows.push({ label: "Deposit paid", value: money(context, context.booking.depositPaidCents) });
    rows.push({ label: "Reference", value: context.booking.reference });
    return rows;
}

function bookingUrl(context: BookingEmailContext) {
    return `${context.baseUrl}/booking/${context.booking.publicToken}`;
}

function businessPageUrl(context: BookingEmailContext) {
    return `${context.baseUrl}/${context.business.slug}`;
}

function contactLine(context: BookingEmailContext) {
    const ways = [context.business.phone, context.business.email].filter(Boolean);
    return ways.length ? `Questions? Reach ${context.business.name} at ${ways.join(" or ")}.` : undefined;
}

function customerEmail(context: BookingEmailContext, subject: string, content: Omit<EmailContent, "sender">): RenderedEmail {
    return {
        subject,
        replyTo: context.business.email ?? undefined,
        ...renderEmail({ ...content, sender: { name: context.business.name, color: context.business.brandColor } }),
    };
}

function ownerEmail(subject: string, content: Omit<EmailContent, "sender">): RenderedEmail {
    return { subject, ...renderEmail({ ...content, sender: { name: siteConfig.name, color: "#1c3d70" } }) };
}

type Template = (context: BookingEmailContext) => RenderedEmail;

export const bookingTemplates: Record<string, Template> = {
    "booking.confirmed": (context) =>
        customerEmail(context, `You're booked with ${context.business.name} · ${when(context)}`, {
            preheader: `${when(context)}. Save this email for your booking details.`,
            heading: "You're booked!",
            paragraphs: [`Hi ${context.customer.name}, ${context.business.name} has you down for ${when(context)}.`],
            details: bookingDetails(context),
            button: { label: "View your booking", url: bookingUrl(context) },
            secondaryLink: { label: "Add it to your calendar", url: `${bookingUrl(context)}/calendar` },
            footer: [
                contactLine(context),
                context.business.cancellationWindowHours > 0
                    ? `Need to change plans? Please let them know at least ${context.business.cancellationWindowHours} hours ahead.`
                    : undefined,
            ]
                .filter(Boolean)
                .join(" "),
        }),

    "booking.requested": (context) =>
        customerEmail(context, `Request sent to ${context.business.name}`, {
            preheader: `${context.business.name} will confirm ${when(context)} shortly.`,
            heading: "Your request is in",
            paragraphs: [
                `Hi ${context.customer.name}, ${context.business.name} has your request for ${when(context)}.`,
                "You'll get another email as soon as they confirm it.",
            ],
            details: bookingDetails(context),
            button: { label: "View your request", url: bookingUrl(context) },
            footer: contactLine(context),
        }),

    "booking.deposit_reminder": (context) => {
        const holdUntil = context.booking.holdExpiresAt ? formatTime(context.booking.holdExpiresAt, context.business.timezone) : null;
        return customerEmail(context, `Finish booking with ${context.business.name}`, {
            preheader: `Your time is held${holdUntil ? ` until ${holdUntil}` : ""}. Pay the deposit to lock it in.`,
            heading: "Your time is still held",
            paragraphs: [
                `Hi ${context.customer.name}, we're holding ${when(context)} for you${holdUntil ? ` until ${holdUntil}` : ""}.`,
                `Pay the ${money(context, context.booking.depositDueCents)} deposit to lock it in. After that, the time opens up for other customers.`,
            ],
            details: bookingDetails(context),
            button: { label: `Pay ${money(context, context.booking.depositDueCents)} deposit`, url: bookingUrl(context) },
            footer: contactLine(context),
        });
    },

    "booking.hold_expired": (context) =>
        customerEmail(context, `Your hold with ${context.business.name} expired`, {
            preheader: "The deposit wasn't paid in time, so the slot was released. You can pick a new one.",
            heading: "That time was released",
            paragraphs: [
                `Hi ${context.customer.name}, we held ${when(context)} for 30 minutes but the deposit wasn't paid, so the time was released.`,
                "No payment was taken. You can pick a new time whenever you're ready.",
            ],
            button: { label: "Pick a new time", url: businessPageUrl(context) },
            footer: contactLine(context),
        }),

    "booking.cancelled": (context) =>
        customerEmail(context, `Your booking with ${context.business.name} was cancelled`, {
            preheader: `${when(context)} is cancelled.`,
            heading: "Your booking was cancelled",
            paragraphs: [
                `Hi ${context.customer.name}, your booking for ${when(context)} has been cancelled.`,
                ...(context.booking.cancellationReason && context.booking.cancellationReason !== "Payment hold expired"
                    ? [`Reason: ${context.booking.cancellationReason}`]
                    : []),
                ...(context.booking.depositPaidCents > 0 ? ["If you paid a deposit, any refund is handled by the business under their policy."] : []),
            ],
            button: { label: "Book another time", url: businessPageUrl(context) },
            footer: contactLine(context),
        }),

    "booking.rescheduled": (context) => {
        const previous = typeof context.payload.previous_start === "string" ? context.payload.previous_start : null;
        return customerEmail(context, `New time: ${context.business.name} · ${when(context)}`, {
            preheader: `Your booking moved to ${when(context)}.`,
            heading: "Your booking has a new time",
            paragraphs: [
                `Hi ${context.customer.name}, your booking with ${context.business.name} is now ${when(context)}${previous ? ` (was ${when(context, previous)})` : ""}.`,
            ],
            details: bookingDetails(context),
            button: { label: "View your booking", url: bookingUrl(context) },
            secondaryLink: { label: "Update your calendar", url: `${bookingUrl(context)}/calendar` },
            footer: contactLine(context),
        });
    },

    "booking.reminder": (context) =>
        customerEmail(context, `Reminder: ${context.business.name} · ${when(context)}`, {
            preheader: `See you ${when(context)}.`,
            heading: "See you soon",
            paragraphs: [`Hi ${context.customer.name}, a reminder that ${context.business.name} is coming ${when(context)}.`],
            details: bookingDetails(context),
            button: { label: "View your booking", url: bookingUrl(context) },
            footer: contactLine(context),
        }),

    "owner.new_booking": (context) =>
        ownerEmail(`New booking: ${context.customer.fullName} · ${when(context)}`, {
            preheader: `${context.services.join(", ")} for ${context.customer.fullName}.`,
            heading: "You have a new booking",
            paragraphs: [`${context.customer.fullName} booked ${when(context)} on your ${context.business.name} page.`],
            details: bookingDetails(context),
            button: { label: "Open the job", url: `${context.baseUrl}/dashboard/schedule/${context.booking.id}` },
        }),

    "owner.new_request": (context) =>
        ownerEmail(`Booking request: ${context.customer.fullName} · ${when(context)}`, {
            preheader: "Accept or decline it from your schedule.",
            heading: "New request waiting for you",
            paragraphs: [`${context.customer.fullName} asked for ${when(context)} on your ${context.business.name} page. They'll hear from you once you accept or decline.`],
            details: bookingDetails(context),
            button: { label: "Review the request", url: `${context.baseUrl}/dashboard/schedule/${context.booking.id}` },
        }),
};

export function teamInviteEmail({
    businessName,
    inviterName,
    role,
    url,
}: {
    businessName: string;
    inviterName: string;
    role: "admin" | "crew";
    url: string;
}): RenderedEmail {
    return ownerEmail(`${inviterName} invited you to ${businessName} on ${siteConfig.name}`, {
        preheader: `Join ${businessName} to see your jobs and routes.`,
        heading: `Join ${businessName}`,
        paragraphs: [
            `${inviterName} added you to ${businessName} on ${siteConfig.name} as ${role === "admin" ? "an admin" : "part of the crew"}.`,
            role === "admin"
                ? "You'll be able to manage the schedule, customers, services and the booking page."
                : "You'll see your jobs, today's route and customer details on your phone.",
        ],
        button: { label: "Accept the invite", url },
        footer: "This link works once and expires in 7 days. If you weren't expecting it, you can ignore this email.",
    });
}
