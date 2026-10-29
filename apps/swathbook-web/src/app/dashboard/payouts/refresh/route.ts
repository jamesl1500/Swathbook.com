import type { NextRequest } from "next/server";
import { handleOnboardingRefresh } from "../stripe-redirects";

export function GET(request: NextRequest) {
  return handleOnboardingRefresh(request);
}
