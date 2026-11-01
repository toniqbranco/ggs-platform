import type { NextRequest } from "next/server";
import { createPilotGateway, getPilotAuthConfig } from "@/lib/auth/server";
import { getServerEnvironment } from "@/lib/env/server";
import { readStoredReview } from "@/lib/pilot/review-database";
import { runStoredReview } from "@/lib/pilot/stored-review-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return runStoredReview(request, {
    config: getPilotAuthConfig,
    gateway: createPilotGateway,
    enabled: () =>
      getServerEnvironment().PILOT_REVIEW_STORAGE_ENABLED === "true",
    read: readStoredReview,
  });
}
