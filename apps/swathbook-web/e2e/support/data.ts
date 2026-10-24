import { randomUUID } from "node:crypto";

/** Unique per test, so specs can run in parallel against one database. */
export function uniqueId() {
    return randomUUID().slice(0, 8);
}

export function uniqueEmail(label = "user") {
    return `${label}-${uniqueId()}@e2e.swathbook.test`;
}

export function uniqueSlug(label = "biz") {
    return `${label}-${uniqueId()}`;
}

export const PASSWORD = "correct-horse-battery";
