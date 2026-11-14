/**
 * customer.ts
 *
 * Validation for the customer sign-in and profile forms. The database checks
 * the same rules again (save_my_details); these give friendlier messages.
 *
 * @module src/libs/validation/customer
 * @since 1.0.0
 */

import { z } from "zod";
import { emailField } from "./auth";

export const customerEmailSchema = z.object({ email: emailField });

/**
 * Supabase's code length is a project setting (6 to 10 digits; the hosted
 * project sends 8), so accept the whole range. Spaces and dashes people type
 * or paste are ignored.
 */
export const customerCodeSchema = z.object({
    email: emailField,
    code: z
        .string()
        .transform((value) => value.replace(/[\s-]/g, ""))
        .pipe(z.string().regex(/^\d{6,10}$/, { error: "Enter the code from the email." })),
});

const optional = (max: number) => z.string().trim().max(max, { error: `Keep it under ${max} characters.` });

export const customerDetailsSchema = z
    .object({
        fullName: z.string().trim().min(2, { error: "Enter your name." }).max(120, { error: "Keep it under 120 characters." }),
        phone: z
            .string()
            .trim()
            .refine((value) => value === "" || /^\+?[0-9 ().-]{7,20}$/.test(value), { error: "Enter a valid phone number." }),
        line1: optional(200),
        line2: optional(200),
        city: optional(100),
        region: optional(100),
        postalCode: optional(20),
    })
    .refine((values) => values.line1 === "" || values.line1.length >= 3, {
        error: "Enter a street address, or leave it blank.",
        path: ["line1"],
    });

export type CustomerDetailsInput = z.infer<typeof customerDetailsSchema>;
