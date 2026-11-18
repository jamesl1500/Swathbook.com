import { measurementMapUrl } from "@/libs/google/satellite";
import { classifyMapsError, MAPS_PROBLEM_HINTS } from "@/libs/google/problems";
import type { Polygon } from "@/libs/measure/geo";
import { createClient } from "@/libs/supabase/server";

/**
 * The outline a customer drew when booking, on a satellite photo, so the
 * owner can check it. Proxied so the Google key stays on the server; RLS
 * limits it to people in the booking's business.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/maps/measurement/[bookingId]">) {
    const { bookingId } = await params;
    if (!/^[0-9a-f-]{36}$/.test(bookingId)) return new Response("Not found", { status: 404 });

    const supabase = await createClient();
    const { data: booking } = await supabase.from("bookings").select("measurement").eq("id", bookingId).maybeSingle();
    const polygons = Array.isArray(booking?.measurement) ? (booking.measurement as Polygon[]) : null;
    if (!polygons?.length) return new Response("Not found", { status: 404 });

    const url = measurementMapUrl(polygons);
    if (!url) return new Response("Maps aren't configured", { status: 404 });

    const image = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!image?.ok) {
        const problem = image ? classifyMapsError("Maps Static API", image.status, await image.text()) : null;
        const reason = problem ? `${problem.reason}: ${MAPS_PROBLEM_HINTS[problem.reason]}. Google said: ${problem.detail}` : "no response";
        console.error(`[google] Maps Static API measurement map failed (${reason})`);
        return new Response("Map unavailable", { status: 502 });
    }
    return new Response(image.body, {
        headers: { "Content-Type": image.headers.get("Content-Type") ?? "image/png", "Cache-Control": "private, max-age=3600" },
    });
}
