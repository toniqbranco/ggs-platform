import { NextRequest, NextResponse } from "next/server";
import { privateResponse, runAuth } from "@/lib/auth/flow";
import type { PreviewApplication } from "./applications";

type Dependencies = Parameters<typeof runAuth>[2];

// Never import this fixture payload into client components or public pages.
const applications: PreviewApplication[] = [
  {
    id: "DEMO-001",
    name: "Alex Demo",
    email: "alex@example.invalid",
    country: "Colombia",
    platform: "tiktok",
    profile: "https://example.invalid/alex",
    state: "pending",
  },
  {
    id: "DEMO-002",
    name: "Sam Demo",
    email: "sam@example.invalid",
    country: "México",
    platform: "twitch",
    profile: "https://example.invalid/sam",
    state: "approved",
  },
  {
    id: "DEMO-003",
    name: "River Demo",
    email: "river@example.invalid",
    country: "España",
    platform: "youtube",
    profile: "https://example.invalid/river",
    state: "rejected",
  },
];

export function ownerPreviewAccess(request: NextRequest, deps: Dependencies) {
  // Caller-controlled area/role flags cannot choose a weaker target.
  const url = new URL(request.url);
  url.pathname = "/auth/access";
  url.search = "?area=pilot-management";
  return runAuth(
    "access",
    new NextRequest(url, { headers: request.headers }),
    deps,
  );
}

export async function runReviewPreview(
  request: NextRequest,
  deps: Dependencies,
) {
  const access = await ownerPreviewAccess(request, deps);
  if (!access.ok) return access;
  const response = privateResponse(
    NextResponse.json({ preview: true, applications }),
  );
  for (const cookie of access.cookies.getAll()) response.cookies.set(cookie);
  return response;
}
