import type { NextRequest } from "next/server";
import { handlePilotSetupStatus } from "@/lib/pilot/setup-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handlePilotSetupStatus(request);
}
