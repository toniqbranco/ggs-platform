import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { boundedJson } from "../../../proposals/streamer-onboarding/http-fixture";
import {
  createTestingOnboardingAdapter,
  OnboardingAdapterError,
  type OnboardingQuery,
  testingOnboardingOrigin,
  testingScopeSchema,
} from "../../../proposals/streamer-onboarding/adapter";
import {
  createPilotSetupVerifier,
  getPilotAuthConfig,
} from "@/lib/auth/server";
import { privateResponse } from "@/lib/auth/flow";
import { readSetupReaderCredential } from "./review-credential";
import { withTestingReadOnlyClient } from "./testing-readonly";

export function getPilotSetupConfig() {
  if (
    process.env.GGS_PILOT_SETUP_ENABLED !== "single-streamer" ||
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV === "production" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    return null;
  const auth = getPilotAuthConfig();
  if (
    !auth.enabled ||
    !auth.ownerUserId ||
    auth.appOrigin !== testingOnboardingOrigin
  )
    return null;
  const scope = testingScopeSchema.safeParse({
    subject: process.env.GGS_PILOT_SETUP_SUBJECT_ID,
    invitationId: process.env.GGS_PILOT_SETUP_INVITATION_ID,
    applicationId: process.env.GGS_PILOT_SETUP_APPLICATION_ID,
    applicationRevision: Number(
      process.env.GGS_PILOT_SETUP_APPLICATION_REVISION,
    ),
  });
  if (!scope.success || scope.data.subject === auth.ownerUserId) return null;
  return {
    ownerUserId: auth.ownerUserId,
    providerOrigin: auth.url,
    appOrigin: auth.appOrigin,
    scope: scope.data,
  };
}

export function matchesPilotSetupHost(headers: Pick<Headers, "get">) {
  const host = headers.get("host");
  const forwardedHost = headers.get("x-forwarded-host");
  return (
    host === new URL(testingOnboardingOrigin).host &&
    (!forwardedHost || forwardedHost === host)
  );
}

async function queryStatus(
  signal: AbortSignal,
  sql: string,
  values: unknown[],
) {
  const credential = await readSetupReaderCredential(signal);
  return withTestingReadOnlyClient(
    "ggs_ob_reader_login",
    credential,
    signal,
    (client) => client.query(sql, values),
  );
}

export async function readPilotSetupStatus(
  request: NextRequest,
  response: NextResponse,
  config: NonNullable<ReturnType<typeof getPilotSetupConfig>>,
  query: OnboardingQuery["query"] = (sql, values) =>
    queryStatus(request.signal, sql, values),
) {
  const verify = createPilotSetupVerifier(request, response);
  const unavailable = async () => {
    throw new OnboardingAdapterError("unavailable");
  };
  const adapter = createTestingOnboardingAdapter({
    ...config,
    enabled: true,
    verify,
    setup: { query: unavailable },
    verifyEvidence: unavailable,
    readApprovedBinding: async (id) => {
      try {
        const result = await query(
          "select ggs_onboarding.read_approved_binding($1,$2) result",
          [config.scope.subject, id],
        );
        return result.rows[0]?.result;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "42501"
        )
          return null;
        throw error;
      }
    },
    reader: { query },
  });
  const result = await adapter.readSelf({
    invitationId: config.scope.invitationId,
  });
  return result.membership === "active"
    ? ("complete" as const)
    : ("pending" as const);
}

export async function handlePilotSetupStatus(
  request: NextRequest,
  read: typeof readPilotSetupStatus = readPilotSetupStatus,
) {
  const config = getPilotSetupConfig();
  const carrier = new NextResponse();
  function reply(body: object, status = 200) {
    const result = privateResponse(NextResponse.json(body, { status }));
    for (const cookie of carrier.cookies.getAll()) result.cookies.set(cookie);
    return result;
  }
  if (!config || !matchesPilotSetupHost(request.headers))
    return reply({ error: "not-found" }, 404);
  if (
    request.method !== "POST" ||
    new URL(request.url).search ||
    request.headers.get("origin") !== config.appOrigin ||
    request.headers.get("sec-fetch-site") !== "same-origin"
  )
    return reply({ error: "denied" }, 403);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    return reply({ error: "invalid" }, 415);
  try {
    z.strictObject({}).parse(await boundedJson(request));
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  try {
    return reply({ status: await read(request, carrier, config) });
  } catch (error) {
    return error instanceof OnboardingAdapterError && error.reason === "denied"
      ? reply({ error: "denied" }, 403)
      : reply({ error: "unavailable" }, 503);
  }
}
