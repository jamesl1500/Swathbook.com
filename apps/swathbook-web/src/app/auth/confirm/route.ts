import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { routes, safeNextPath } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";

/**
 * Landing point for links in Supabase auth emails (signup confirmation,
 * password recovery and email changes). Exchanges the token for a session cookie, then sends the
 * user on to `next`.
 *
 * Supports both the recommended token-hash email templates
 * (`/auth/confirm?token_hash=…&type=…&next=…`) and the default PKCE `?code=` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next")) ?? routes.onboarding;

  const supabase = await createClient();
  let failed = true;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  }

  if (!failed) {
    return NextResponse.redirect(new URL(next, request.url));
  }

  const fallback = new URL(fallbackPath(type, next), request.url);
  fallback.searchParams.set("error", "link_expired");
  return NextResponse.redirect(fallback);
}

function fallbackPath(type: EmailOtpType | null, next: string) {
  if (type === "email_change") return routes.account;
  if (type === "recovery" || next.startsWith(routes.resetPassword)) return routes.forgotPassword;
  return routes.verifyEmail;
}
