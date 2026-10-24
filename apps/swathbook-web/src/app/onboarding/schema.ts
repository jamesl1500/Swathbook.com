/**
 * schema.ts
 *
 * Onboarding validation, shared by the wizard (per-step checks) and the
 * Server Action (the source of truth).
 *
 * @module src/app/onboarding/schema
 * @since 1.0.0
 */

import { z } from "zod";

/** Paths a booking link can't use because the app (or common sense) needs them. */
const RESERVED_SLUGS = new Set([
    "about", "admin", "api", "app", "auth", "billing", "blog", "book", "careers", "contact", "dashboard",
    "features", "help", "industries", "legal", "login", "logout", "onboarding", "pricing", "privacy",
    "settings", "signup", "support", "swathbook", "terms", "www",
]);

export const slugField = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { error: "Use at least 3 characters." })
    .max(40, { error: "Keep it to 40 characters or fewer." })
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
        error: "Use lowercase letters, numbers and dashes (no dash at the start or end).",
    })
    .refine((slug) => !RESERVED_SLUGS.has(slug), { error: "That link is reserved. Try another." });

export const serviceSchema = z.object({
    name: z.string().trim().min(2, { error: "Name this service." }).max(80),
    price: z
        .number({ error: "Enter a price." })
        .min(0, { error: "Price can't be negative." })
        .max(100_000, { error: "That's a big job. Contact us for custom pricing." }),
    durationMinutes: z.number().int().min(15).max(720),
    depositPercent: z.number().int().min(0).max(100),
});

const timeField = z.string().regex(/^\d{2}:\d{2}$/, { error: "Pick a time." });

export const onboardingSchema = z
    .object({
        businessName: z.string().trim().min(2, { error: "Enter your business name." }).max(80),
        trade: z.string().min(1, { error: "Pick the kind of work you do." }),
        phone: z.string().trim().max(30).optional(),
        slug: slugField,
        services: z
            .array(serviceSchema)
            .min(1, { error: "Add at least one service." })
            .max(20, { error: "You can add up to 20 services for now." }),
        baseAddress: z.string().trim().min(5, { error: "Enter the address your day starts from." }).max(200),
        serviceRadiusMiles: z.number().int().min(1).max(200),
        workDays: z.array(z.number().int().min(0).max(6)).min(1, { error: "Pick at least one day." }),
        dayStart: timeField,
        dayEnd: timeField,
        timezone: z.string().max(64).optional(),
    })
    .refine((values) => values.dayEnd > values.dayStart, {
        error: "Your day has to end after it starts.",
        path: ["dayEnd"],
    });

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingValues = z.output<typeof onboardingSchema>;
