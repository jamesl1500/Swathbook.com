import { staticMapUrl } from "@/libs/google/maps";
import { createClient } from "@/libs/supabase/server";

/**
 * Route map image. Proxied so the Google key stays on the server; RLS limits
 * it to people in the route's business.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/maps/route/[routeId]">) {
  const { routeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(routeId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: route } = await supabase
    .from("routes")
    .select("start_lat, start_lng, optimization_meta, route_stops(sequence, bookings(customer_addresses(lat, lng)))")
    .eq("id", routeId)
    .maybeSingle();
  if (!route) return new Response("Not found", { status: 404 });

  const stops = [...route.route_stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => stop.bookings?.customer_addresses)
    .filter((address): address is { lat: number; lng: number } => address?.lat != null && address?.lng != null);
  const meta = (route.optimization_meta ?? {}) as { polyline?: string | null };
  const url = staticMapUrl({
    start: route.start_lat != null && route.start_lng != null ? { lat: route.start_lat, lng: route.start_lng } : null,
    stops,
    polyline: meta.polyline ?? null,
  });
  if (!url) return new Response("Maps aren't configured", { status: 404 });

  const image = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!image.ok) return new Response("Map unavailable", { status: 502 });
  return new Response(image.body, {
    headers: { "Content-Type": image.headers.get("Content-Type") ?? "image/png", "Cache-Control": "private, max-age=300" },
  });
}
