import type { NextRequest } from "next/server";
import { runAuth } from "@/lib/auth/flow";
import { createPilotGateway, getPilotAuthConfig } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest) {
  return runAuth("sign-in", request, {
    config: getPilotAuthConfig,
    gateway: createPilotGateway,
  });
}
