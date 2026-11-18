import { classifyMapsError, MAPS_PROBLEM_HINTS } from "@/libs/google/problems";
import { satelliteImageUrl, verifySatelliteLink } from "@/libs/google/satellite";

/**
 * Satellite photo for measuring on the booking page. Only serves links the
 * server signed (see libs/google/satellite.ts), so the Google key stays here
 * and nobody can point this at anywhere they like.
 */
export async function GET(request: Request) {
    const verified = verifySatelliteLink(new URL(request.url).searchParams);
    if (!verified) return new Response("Not found", { status: 404 });

    const url = satelliteImageUrl(verified);
    if (!url) return new Response("Maps aren't configured", { status: 404 });

    const image = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!image?.ok) {
        // The customer just sees "enter the size instead"; the reason goes to the log.
        const problem = image ? classifyMapsError("Maps Static API", image.status, await image.text()) : null;
        const reason = problem ? `${problem.reason}: ${MAPS_PROBLEM_HINTS[problem.reason]}. Google said: ${problem.detail}` : "no response";
        console.error(`[google] Maps Static API satellite photo failed (${reason})`);
        return new Response("Map unavailable", { status: 502 });
    }
    return new Response(image.body, {
        headers: {
            "Content-Type": image.headers.get("Content-Type") ?? "image/png",
            // The browser may keep it while the customer draws; nothing shared caches it.
            "Cache-Control": "private, max-age=3600",
        },
    });
}
