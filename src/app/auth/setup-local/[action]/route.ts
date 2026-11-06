import { type NextRequest } from "next/server";
import { runLocalSetup } from "../../../../../proposals/streamer-onboarding/local-app-fixture";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: NextRequest) => runLocalSetup(request);
export const GET = (request: NextRequest) => runLocalSetup(request);
