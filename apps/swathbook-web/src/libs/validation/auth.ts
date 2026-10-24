/**
 * auth.ts
 *
 * Validation for the auth forms. Shared by Server Actions (the source of truth)
 * and any client-side checks.
 *
 * @module src/libs/validation/auth
 * @since 1.0.0
 */

import { z } from "zod";

export const emailField = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address." }));

export const passwordField = z
    .string()
    .min(8, { error: "Use at least 8 characters." })
    .max(72, { error: "Keep it under 72 characters." });

export const signInSchema = z.object({
    email: emailField,
    password: z.string().min(1, { error: "Enter your password." }),
});

export const signUpSchema = z.object({
    fullName: z.string().trim().min(2, { error: "Tell us your name." }).max(80),
    email: emailField,
    password: passwordField,
    slug: z.string().trim().toLowerCase().max(40).optional(),
});

export const forgotPasswordSchema = z.object({
    email: emailField,
});

export const resetPasswordSchema = z
    .object({
        password: passwordField,
        confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
        error: "Passwords don't match.",
        path: ["confirmPassword"],
    });

// --- Account settings ----------------------------------------------------------

export const fullNameField = z.string().trim().min(2, { error: "Enter your name." }).max(80, { error: "Keep it under 80 characters." });

export const changeNameSchema = z.object({ fullName: fullNameField });

const currentPasswordField = z.string().min(1, { error: "Enter your current password." });

export const changeEmailSchema = z.object({
    email: emailField,
    currentPassword: currentPasswordField,
});

export const changePasswordSchema = z
    .object({
        currentPassword: currentPasswordField,
        password: passwordField,
        confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
        error: "Passwords don't match.",
        path: ["confirmPassword"],
    });

/** Typed exactly, so nobody deletes their account by accident. */
export const DELETE_CONFIRMATION = "delete my account";

export const deleteAccountSchema = z.object({
    confirmation: z
        .string()
        .trim()
        .toLowerCase()
        .refine((value) => value === DELETE_CONFIRMATION, { error: `Type "${DELETE_CONFIRMATION}" to confirm.` }),
    currentPassword: currentPasswordField,
});
