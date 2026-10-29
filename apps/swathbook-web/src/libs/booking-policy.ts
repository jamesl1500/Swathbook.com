/**
 * booking-policy.ts
 *
 * Small rules about a business's booking policy, shared by server pages and
 * client controls.
 *
 * @module src/libs/booking-policy
 * @since 1.0.0
 */

/** Whether approving a cancellation should refund by default, from the refund policy. */
export function refundByDefault(policy: string, requestedAt: string | null, start: string, windowHours: number) {
    if (policy === "refundable") return true;
    if (policy === "refundable_before_window" && requestedAt) {
        return Date.parse(start) - Date.parse(requestedAt) >= windowHours * 3_600_000;
    }
    return false;
}
