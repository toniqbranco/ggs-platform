import type { NextRequest } from "next/server";
import { createPilotGateway, getPilotAuthConfig } from "@/lib/auth/server";
import { runReviewPreview } from "@/lib/pilot/review-preview";

export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return runReviewPreview(request, {
    config: getPilotAuthConfig,
    gateway: createPilotGateway,
  });
}
