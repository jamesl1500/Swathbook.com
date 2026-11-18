/**
 * Runs in the browser before the app becomes interactive.
 *
 * Zod normally probes for eval (new Function) to compile faster validators.
 * The Content-Security-Policy (src/libs/csp.ts) forbids eval, so the probe
 * fails, harmlessly but with a CSP violation report on every page. Our forms
 * are small, so plain validation costs nothing noticeable.
 */
import { z } from "zod";

z.config({ jitless: true });
