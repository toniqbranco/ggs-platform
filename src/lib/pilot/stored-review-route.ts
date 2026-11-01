import { NextRequest, NextResponse } from "next/server";
import { privateResponse, runAuth } from "@/lib/auth/flow";
import { ownerPreviewAccess } from "./review-preview";
import {
  reviewRequestSchema,
  storedReviewDataSchema,
  type ReviewRequest,
} from "./stored-review-contract";

type Dependencies = Parameters<typeof runAuth>[2] & {
  enabled(): boolean;
  read(
    input: ReviewRequest,
    ownerId: string,
    signal: AbortSignal,
  ): Promise<unknown>;
};

export async function runStoredReview(
  request: NextRequest,
  deps: Dependencies,
) {
  let access: NextResponse | undefined;
  function response(body: unknown, status = 200) {
    const result = privateResponse(NextResponse.json(body, { status }));
    result.headers.set("Vary", "Cookie");
    if (access)
      for (const cookie of access.cookies.getAll()) result.cookies.set(cookie);
    return result;
  }
  try {
    if (!deps.enabled()) return response({ error: "unavailable" }, 503);
    const config = deps.config();
    if (!config.enabled || !config.ownerUserId)
      return response({ error: "unavailable" }, 503);
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") &&
        request.headers.get("origin") !== config.appOrigin)
    )
      return response({ error: "denied" }, 403);
    // Reuses fresh getUser/admission checks and the fixed owner-only target.
    access = await ownerPreviewAccess(request, {
      ...deps,
      config: () => config,
    });
    if (!access.ok) {
      access.headers.set("Vary", "Cookie");
      return access;
    }
    const params = new URL(request.url).searchParams;
    // Reject duplicates and unexpected inputs instead of weakening the target.
    const input = Object.fromEntries(params);
    if ([...params.keys()].length !== Object.keys(input).length)
      return response({ error: "invalid" }, 400);
    const parsed = reviewRequestSchema.safeParse(input);
    if (!parsed.success) return response({ error: "invalid" }, 400);
    const data = storedReviewDataSchema.parse(
      await deps.read(parsed.data, config.ownerUserId, request.signal),
    );
    return response({ mode: "stored-readonly", ...data });
  } catch {
    return response({ error: "unavailable" }, 503);
  }
}
