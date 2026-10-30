import type { NextRequest } from "next/server";
import { runAuth } from "@/lib/auth/flow";
import { createPilotGateway, getPilotAuthConfig } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
// A protected authorization probe, not a dashboard or a public permission editor.
export function GET(request: NextRequest) {
  return runAuth("access", request, {
    config: getPilotAuthConfig,
    gateway: createPilotGateway,
  });
}
