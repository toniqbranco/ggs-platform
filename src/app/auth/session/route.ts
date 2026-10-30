import type { NextRequest } from "next/server";
import { runAuth } from "@/lib/auth/flow";
import { createPilotGateway, getPilotAuthConfig } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return runAuth("session", request, {
    config: getPilotAuthConfig,
    gateway: createPilotGateway,
  });
}
