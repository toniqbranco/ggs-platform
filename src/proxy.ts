import { NextRequest, NextResponse } from "next/server";
import { createPilotGateway, getPilotAuthConfig } from "@/lib/auth/server";
import { privateResponse } from "@/lib/auth/flow";
import { ownerPreviewAccess } from "@/lib/pilot/review-preview";

// Page visibility is guarded here; the data endpoint independently reauthorizes.
export async function proxy(request: NextRequest) {
  const access = await ownerPreviewAccess(request, {
    config: getPilotAuthConfig,
    gateway: createPilotGateway,
  });
  if (!access.ok) {
    const denied = privateResponse(
      new NextResponse("Not found", {
        status: access.status === 503 ? 503 : 404,
      }),
    );
    for (const cookie of access.cookies.getAll()) denied.cookies.set(cookie);
    return denied;
  }
  const response = privateResponse(NextResponse.next());
  for (const cookie of access.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export const config = {
  matcher: ["/es/hq/applications", "/en/hq/applications"],
};
