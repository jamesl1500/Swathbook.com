import type { NextRequest } from "next/server";
import { handleOnboardingReturn } from "../stripe-redirects";

export function GET(request: NextRequest) {
  return handleOnboardingReturn(request);
}
