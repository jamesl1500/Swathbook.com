/**
 * forms.ts
 *
 * Shared shape for Server Action form results, plus small FormData readers.
 *
 * @module src/libs/forms
 * @since 1.0.0
 */

import { z } from "zod";

export type FormState = {
    error?: string;
    success?: string;
    fieldErrors?: Partial<Record<string, string[]>>;
};

export function text(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
}

/** Checkbox semantics: present ("on"/"true") means true. */
export function checkbox(formData: FormData, key: string) {
    const value = formData.get(key);
    return value === "on" || value === "true";
}

export function invalid(error: z.ZodError): FormState {
    return { fieldErrors: z.flattenError(error).fieldErrors as FormState["fieldErrors"], error: "Check the highlighted fields." };
}

/** Dollars typed by a person ("45", "$45.50", "1,200") to integer cents. */
export const dollarsToCents = z
    .string()
    .trim()
    .transform((value) => value.replace(/[$,\s]/g, ""))
    .pipe(z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, { error: "Enter an amount like 45 or 45.50." }))
    .transform((value) => Math.round(Number(value) * 100));
