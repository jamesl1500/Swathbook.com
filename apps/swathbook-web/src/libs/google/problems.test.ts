import { describe, expect, it } from "vitest";
import { classifyMapsError, networkProblem } from "./problems";

// Real responses from a Google Cloud project without billing.
const ROUTE_MATRIX_DENIED = JSON.stringify([
    {
        error: {
            code: 403,
            message: "Permission denied on the service.",
            status: "PERMISSION_DENIED",
            details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "ACCESS_DENIED", domain: "googleapis.com", metadata: { service: "routes.googleapis.com" } }],
        },
    },
]);
const STATIC_BILLING =
    "The Google Maps Platform server rejected your request. You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable";
const GEOCODE_NOT_ENABLED = JSON.stringify({
    status: "REQUEST_DENIED",
    error_message: "This API is not activated on your API project. You may need to enable this API in the Google Cloud Console.",
    results: [],
});

describe("classifyMapsError", () => {
    it("reads the Route Matrix's vague 403 as permission denied", () => {
        expect(classifyMapsError("Routes API", 403, ROUTE_MATRIX_DENIED)).toEqual({
            api: "Routes API",
            reason: "denied",
            detail: "Permission denied on the service.",
        });
    });

    it("spots billing in Static Maps' plain-text answer", () => {
        expect(classifyMapsError("Maps Static API", 403, STATIC_BILLING).reason).toBe("billing");
    });

    it("spots an API that isn't enabled, from Geocoding's 200 response", () => {
        expect(classifyMapsError("Geocoding API", 200, GEOCODE_NOT_ENABLED)).toMatchObject({ reason: "not_enabled", detail: expect.stringContaining("not activated") });
    });

    it("spots key restrictions, quotas, and everything else", () => {
        const blocked = JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "Requests to this API are blocked.", details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } });
        expect(classifyMapsError("Routes API", 403, blocked).reason).toBe("key_blocked");
        expect(classifyMapsError("Routes API", 429, JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } })).reason).toBe("quota");
        expect(classifyMapsError("Routes API", 503, "")).toEqual({ api: "Routes API", reason: "unavailable", detail: "HTTP 503" });
    });

    it("says when Google couldn't be reached", () => {
        const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
        expect(networkProblem("Routes API", timeout)).toEqual({ api: "Routes API", reason: "unavailable", detail: "Google didn't answer in time." });
    });
});
