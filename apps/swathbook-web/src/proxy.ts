import { NextResponse, type NextRequest } from "next/server";
import { guestOnlyPaths, matchesPath, protectedPaths, routes } from "@/libs/routes";
import { hasSupabaseEnv } from "@/libs/supabase/env";
import { redirectWithSession, updateSession } from "@/libs/supabase/proxy";

/**
 * Keeps the Supabase session fresh and does optimistic auth redirects.
 * Pages and Server Actions still verify the user themselves.
 */
export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    // Let the marketing site run before Supabase is configured.
    return NextResponse.next({ request });
  }

  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!userId && matchesPath(pathname, protectedPaths)) {
    const url = new URL(routes.login, request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithSession(url, response);
  }

  if (userId && matchesPath(pathname, guestOnlyPaths)) {
    return redirectWithSession(new URL(routes.dashboard, request.url), response);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, image optimization and Stripe webhooks
    // (signed server-to-server calls with no session to refresh).
    "/((?!_next/static|_next/image|api/stripe|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
