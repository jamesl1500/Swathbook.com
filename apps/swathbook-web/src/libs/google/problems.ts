/**
 * problems.ts
 *
 * Making sense of Google Maps Platform refusals. Google answers a misconfigured
 * project in several dialects (a 403 JSON error from Routes, REQUEST_DENIED
 * from Geocoding, a plain-text 403 from Static Maps), and some, like the Route
 * Matrix's "Permission denied on the service", don't say what's actually
 * wrong. This turns them into one shape for the server log; people using the
 * app only ever see that something went wrong and what we did instead.
 *
 * @module src/libs/google/problems
 * @since 1.0.0
 */

export type MapsProblemReason = "billing" | "not_enabled" | "key_blocked" | "denied" | "quota" | "unavailable";

export type MapsProblem = {
    /** Which Google API refused, in Cloud Console's words ("Routes API"). */
    api: string;
    reason: MapsProblemReason;
    /** Google's own message, trimmed. Shown to owners as the technical detail. */
    detail: string;
};

const MAX_DETAIL = 300;

function googleMessage(body: string) {
    try {
        const parsed = JSON.parse(body) as unknown;
        const error = (Array.isArray(parsed) ? parsed[0] : parsed) as { error?: { message?: string; status?: string; details?: Array<{ reason?: string }> }; error_message?: string; status?: string };
        return {
            message: error?.error?.message ?? error?.error_message ?? "",
            status: error?.error?.status ?? error?.status ?? "",
            reasons: (error?.error?.details ?? []).map((detail) => detail.reason ?? "").filter(Boolean),
        };
    } catch {
        // Static Maps answers in plain text.
        return { message: body.trim(), status: "", reasons: [] as string[] };
    }
}

/** Classifies a refusal from its HTTP status and body. */
export function classifyMapsError(api: string, httpStatus: number, body: string): MapsProblem {
    const { message, status, reasons } = googleMessage(body);
    const text = `${message} ${status} ${reasons.join(" ")}`;
    const detail = (message || `HTTP ${httpStatus}`).slice(0, MAX_DETAIL);

    let reason: MapsProblemReason;
    if (/billing/i.test(text)) reason = "billing";
    else if (/SERVICE_DISABLED|not (been )?(activated|enabled)|has not been used in project|legacy API/i.test(text)) reason = "not_enabled";
    else if (/API_KEY_(SERVICE|HTTP_REFERRER|IP_ADDRESS|ANDROID_APP|IOS_APP)_BLOCKED|not authorized to use this|API key not valid|API_KEY_INVALID/i.test(text)) reason = "key_blocked";
    else if (httpStatus === 429 || /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|quota/i.test(text)) reason = "quota";
    else if (httpStatus === 403 || /PERMISSION_DENIED|ACCESS_DENIED|REQUEST_DENIED/i.test(text)) reason = "denied";
    else reason = "unavailable";

    return { api, reason, detail };
}

export function networkProblem(api: string, error: unknown): MapsProblem {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { api, reason: "unavailable", detail: timedOut ? "Google didn't answer in time." : "Couldn't reach Google." };
}

/** What to check, for the server log. */
export const MAPS_PROBLEM_HINTS: Record<MapsProblemReason, string> = {
    billing: "link a billing account to the Google Cloud project that owns GOOGLE_MAPS_API_KEY",
    not_enabled: "enable this API on the Google Cloud project that owns GOOGLE_MAPS_API_KEY",
    key_blocked: "allow this API in the key's API restrictions (and don't restrict a server key to websites)",
    denied: "usually no billing account on the key's project; also check the API is enabled and allowed by the key",
    quota: "raise the API's quota or wait",
    unavailable: "temporary; try again",
};
