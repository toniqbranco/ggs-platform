import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createOnboardingAdapter,
  OnboardingAdapterError,
  type OnboardingQuery,
} from "./adapter";
import { profileWriteSchema } from "./contract";
import {
  createFixtureSetupGateway,
  FixtureGatewayError,
  fixturePasswordSchema,
  fixtureSetupOrigin,
  setupCommandSchema,
  type FixtureOperationStore,
} from "./fixture-gateway";

type Dependencies = {
  mode?: "disabled" | "isolated-fixture";
  ownerUserId: string;
  fixtureFetch: typeof fetch;
  operations: FixtureOperationStore;
  setup: OnboardingQuery;
  reader: OnboardingQuery;
};
const invitationSchema = setupCommandSchema
  .extend({ tokenHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const passwordSchema = setupCommandSchema
  .extend({ newPassword: fixturePasswordSchema, confirmPassword: z.string() })
  .strict()
  .refine((value) => value.newPassword === value.confirmPassword);
const readSchema = z.object({ invitationId: z.uuid() }).strict();
const paths = [
  "invitation",
  "password",
  "profile",
  "finalize",
  "status",
] as const;

async function boundedJson(request: NextRequest): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192))
    throw new FixtureGatewayError("invalid");
  if (!request.body) throw new FixtureGatewayError("invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FixtureGatewayError("invalid")), 3000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new FixtureGatewayError("invalid");
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new FixtureGatewayError("invalid");
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
/** Test-only request orchestrator. Deliberately not exported from an app route. */
export async function runSetupHttpFixture(
  request: NextRequest,
  deps: Dependencies,
) {
  const carrier = NextResponse.json({});
  function reply(body: object, status = 200) {
    const response = NextResponse.json(body, { status });
    for (const cookie of carrier.cookies.getAll()) response.cookies.set(cookie);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Vary", "Cookie");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  if (
    deps.mode !== "isolated-fixture" ||
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV === "production" ||
    !z.uuid().safeParse(deps.ownerUserId).success
  )
    return reply({ error: "unavailable" }, 503);
  const url = new URL(request.url);
  const action = url.pathname.slice("/auth/setup/".length);
  if (request.method !== "POST")
    return reply({ error: "method-not-allowed" }, 405);
  if (
    url.origin !== fixtureSetupOrigin ||
    url.search ||
    request.headers.get("origin") !== fixtureSetupOrigin ||
    request.headers.get("sec-fetch-site") !== "same-origin"
  )
    return reply({ error: "denied" }, 403);
  if (
    !url.pathname.startsWith("/auth/setup/") ||
    !paths.some((path) => path === action)
  )
    return reply({ error: "not-found" }, 404);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    return reply({ error: "invalid" }, 415);
  try {
    const raw = await boundedJson(request);
    const schema =
      action === "invitation"
        ? invitationSchema
        : action === "password"
          ? passwordSchema
          : action === "profile"
            ? profileWriteSchema
            : action === "finalize"
              ? setupCommandSchema
              : readSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return reply({ error: "invalid" }, 400);
    const gateway = createFixtureSetupGateway(request, carrier, {
      mode: "isolated-fixture",
      ownerUserId: deps.ownerUserId,
      fixtureFetch: deps.fixtureFetch,
      operations: deps.operations,
    });
    const adapter = createOnboardingAdapter({
      mode: "isolated-fixture",
      ownerUserId: deps.ownerUserId,
      verify: gateway.verify,
      verifyEvidence: gateway.evidence,
      setup: deps.setup,
      reader: deps.reader,
    });
    if (action === "invitation") {
      const input = invitationSchema.parse(parsed.data);
      const { tokenHash, ...command } = input;
      await gateway.verifyInvitation(command, tokenHash);
      return reply(await adapter.recordVerifiedInvitation(command));
    }
    if (action === "password") {
      const input = passwordSchema.parse(parsed.data);
      const { newPassword, confirmPassword: confirmation, ...command } = input;
      void confirmation;
      await gateway.setFirstPassword(command, newPassword);
      return reply(await adapter.recordVerifiedPassword(command));
    }
    if (action === "profile")
      return reply(await adapter.saveProfile(parsed.data));
    if (action === "finalize")
      return reply(await adapter.finalize(parsed.data));
    return reply(await adapter.readSelf(parsed.data));
  } catch (error) {
    const reason =
      error instanceof OnboardingAdapterError ||
      error instanceof FixtureGatewayError
        ? error.reason
        : "unavailable";
    return reply(
      { error: reason },
      reason === "invalid"
        ? 400
        : reason === "denied"
          ? 403
          : reason === "conflict" || reason === "reconciliation-required"
            ? 409
            : 503,
    );
  }
}
