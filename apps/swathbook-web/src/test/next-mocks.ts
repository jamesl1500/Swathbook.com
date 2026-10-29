/**
 * Helpers for testing code that calls Next.js request APIs.
 */
import { expect } from "vitest";

/** Thrown by the mocked `redirect()`, mirroring how Next.js interrupts rendering. */
export class RedirectError extends Error {
    constructor(public readonly url: string) {
        super(`NEXT_REDIRECT ${url}`);
    }
}

export function mockRedirect(url: string): never {
    throw new RedirectError(url);
}

/** Awaits `promise` and asserts it redirected to `url`. */
export async function expectRedirect(promise: Promise<unknown>, url: string) {
    const error = await promise.then(
        () => null,
        (reason: unknown) => reason,
    );
    expect(error, `expected a redirect to ${url}`).toBeInstanceOf(RedirectError);
    expect((error as RedirectError).url).toBe(url);
}

/** A minimal stand-in for the `cookies()` store. */
export function createCookieJar(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        get: (name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined),
        getAll: () => [...values].map(([name, value]) => ({ name, value })),
        set: (name: string, value: string) => {
            values.set(name, value);
        },
        delete: (name: string) => {
            values.delete(name);
        },
        values,
    };
}
