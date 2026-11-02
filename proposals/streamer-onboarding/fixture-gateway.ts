import "server-only";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import type { NextRequest, NextResponse } from "next/server";
import type { EvidenceRequest } from "./adapter";
import { readPilotAdmission } from "../../src/lib/pilot/admission";

export const fixtureSetupOrigin = "http://localhost:3107";
export const fixtureProviderOrigin = "https://onboarding.example.invalid";
export const fixtureCookieName = "sb-ggs-onboarding-fixture-auth-token";
export const setupCommandSchema = z
  .object({
    invitationId: z.uuid(),
    operationId: z.uuid(),
    expectedBindingRevision: z.number().int().positive().max(2147483647),
  })
  .strict();
export type StepKey = z.infer<typeof setupCommandSchema> & {
  kind: "invitation" | "password";
};
const operationSchema = setupCommandSchema
  .extend({
    kind: z.enum(["invitation", "password"]),
    subject: z.uuid(),
    state: z.enum(["claimed", "verified", "in-flight", "reconcile"]),
    evidenceId: z.uuid().nullable(),
    expiresAt: z.iso.datetime(),
    eligible: z.literal(true),
    role: z.literal("streamer"),
  })
  .strict()
  .refine(
    (value) => (value.state === "verified") === (value.evidenceId !== null),
  );
export type FixtureOperation = z.infer<typeof operationSchema>;
export type FixtureOperationStore = {
  // Must atomically check current binding/approval/step and claim only once.
  claim(key: StepKey, verifiedSubject: string | null): Promise<unknown>;
  read(key: StepKey): Promise<unknown>;
  verified(operation: FixtureOperation, evidenceId: string): Promise<void>;
  uncertain(operation: FixtureOperation): Promise<void>;
};
type Options = {
  mode?: "disabled" | "isolated-fixture";
  ownerUserId: string;
  fixtureFetch: typeof fetch;
  operations: FixtureOperationStore;
};
export class FixtureGatewayError extends Error {
  constructor(
    public readonly reason:
      "invalid" | "denied" | "unavailable" | "reconciliation-required",
  ) {
    super(`Setup fixture: ${reason}`);
    this.name = "FixtureGatewayError";
  }
}
export const fixturePasswordSchema = z
  .string()
  .refine(
    (value) =>
      [...value].length >= 12 &&
      Buffer.byteLength(value, "utf8") <= 72 &&
      !value.includes("\0"),
  );
function guard(mode: Options["mode"]) {
  if (
    mode !== "isolated-fixture" ||
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV === "production"
  )
    throw new FixtureGatewayError("unavailable");
}
function keyFor(kind: StepKey["kind"], input: unknown): StepKey {
  const parsed = setupCommandSchema.safeParse(input);
  if (!parsed.success) throw new FixtureGatewayError("invalid");
  return { ...parsed.data, kind };
}
function checkedOperation(raw: unknown, key: StepKey) {
  const parsed = operationSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.kind !== key.kind ||
    parsed.data.invitationId !== key.invitationId ||
    parsed.data.operationId !== key.operationId ||
    parsed.data.expectedBindingRevision !== key.expectedBindingRevision ||
    Date.parse(parsed.data.expiresAt) <= Date.now()
  )
    throw new FixtureGatewayError("denied");
  if (parsed.data.state === "in-flight" || parsed.data.state === "reconcile")
    throw new FixtureGatewayError("reconciliation-required");
  return parsed.data;
}

/** Actual pinned SSR SDK, but a mandatory fake fetch and reserved .invalid origin. */
export function createFixtureSetupGateway(
  request: NextRequest,
  response: NextResponse,
  options: Options,
) {
  guard(options.mode);
  if (!z.uuid().safeParse(options.ownerUserId).success)
    throw new FixtureGatewayError("unavailable");
  const client = createServerClient(
    fixtureProviderOrigin,
    "sb_publishable_onboarding_fixture_not_a_real_key",
    {
      cookieOptions: {
        name: fixtureCookieName,
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
      },
      global: {
        fetch: async (input, init) => {
          guard(options.mode);
          const url = new URL(
            input instanceof Request ? input.url : String(input),
          );
          const method = init?.method ?? "GET";
          const allowed =
            (url.pathname === "/auth/v1/verify" &&
              method === "POST" &&
              !url.search) ||
            (url.pathname === "/auth/v1/user" &&
              ["GET", "PUT"].includes(method) &&
              !url.search) ||
            (url.pathname === "/auth/v1/token" &&
              method === "POST" &&
              url.search === "?grant_type=refresh_token") ||
            (url.pathname === "/auth/v1/logout" &&
              method === "POST" &&
              url.search === "?scope=local");
          if (
            url.origin !== fixtureProviderOrigin ||
            url.username ||
            url.password ||
            !allowed
          )
            throw new FixtureGatewayError("unavailable");
          const result = await options.fixtureFetch(input, {
            ...init,
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          if (result.status >= 300 && result.status < 400)
            throw new FixtureGatewayError("unavailable");
          return result;
        },
      },
      cookies: {
        getAll: () =>
          request.cookies
            .getAll()
            .filter(
              (c) =>
                c.name === fixtureCookieName ||
                c.name.startsWith(fixtureCookieName + "."),
            ),
        setAll(values) {
          for (const { name, value, options: cookie } of values) {
            if (
              name !== fixtureCookieName &&
              !name.startsWith(fixtureCookieName + ".")
            )
              throw new FixtureGatewayError("unavailable");
            const safeCookie = { ...cookie };
            delete safeCookie.domain;
            response.cookies.set(name, value, {
              ...safeCookie,
              httpOnly: true,
              sameSite: "lax",
              secure: false,
              path: "/",
            });
          }
        },
      },
    },
  );
  const verify = async () => {
    guard(options.mode);
    const result = await client.auth.getUser();
    if (
      result.error &&
      typeof result.error.status === "number" &&
      result.error.status >= 400 &&
      result.error.status < 500 &&
      result.error.status !== 429
    )
      return { data: { user: null }, error: null };
    return result;
  };
  async function subject() {
    const { data, error } = await verify();
    const user = data.user;
    const confirmed = z.iso
      .datetime({ offset: true })
      .safeParse(user?.email_confirmed_at);
    if (
      error ||
      !user ||
      user.is_anonymous !== false ||
      !confirmed.success ||
      Date.parse(confirmed.data) > Date.now() ||
      !z.uuid().safeParse(user.id).success ||
      user.id === options.ownerUserId ||
      readPilotAdmission(user, options.ownerUserId)?.roles.some(
        (role) => role === "owner" || role === "admin",
      )
    )
      throw new FixtureGatewayError("denied");
    return user.id;
  }
  async function clear() {
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      /* Cookie denial remains local and unconditional. */
    }
    for (const cookie of [
      ...request.cookies.getAll(),
      ...response.cookies.getAll(),
    ])
      if (
        cookie.name === fixtureCookieName ||
        cookie.name.startsWith(fixtureCookieName + ".")
      )
        response.cookies.set(cookie.name, "", {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          maxAge: 0,
        });
  }
  async function execute(
    kind: StepKey["kind"],
    input: unknown,
    secret: string,
  ) {
    guard(options.mode);
    const key = keyFor(kind, input);
    if (kind === "invitation" && !/^[a-f0-9]{64}$/.test(secret))
      throw new FixtureGatewayError("invalid");
    if (kind === "password" && !fixturePasswordSchema.safeParse(secret).success)
      throw new FixtureGatewayError("invalid");
    const current = kind === "password" ? await subject() : null;
    const operation = checkedOperation(
      await options.operations.claim(key, current),
      key,
    );
    if (operation.subject === options.ownerUserId)
      throw new FixtureGatewayError("denied");
    if (current !== null && operation.subject !== current)
      throw new FixtureGatewayError("denied");
    if (operation.state === "verified") {
      if ((await subject()) !== operation.subject)
        throw new FixtureGatewayError("denied");
      // Do not acknowledge a newly submitted secret as applied. Reconcile using
      // the command-only receipt path, which cannot carry a different password.
      throw new FixtureGatewayError("reconciliation-required");
    }
    try {
      const result =
        kind === "invitation"
          ? await client.auth.verifyOtp({ token_hash: secret, type: "invite" })
          : await client.auth.updateUser({ password: secret });
      if (result.error) throw new FixtureGatewayError("unavailable");
      if ((await subject()) !== operation.subject) {
        await clear();
        throw new FixtureGatewayError("denied");
      }
      await options.operations.verified(operation, randomUUID());
    } catch {
      try {
        await options.operations.uncertain(operation);
      } catch {
        /* Never retry an ambiguous provider operation. */
      }
      if (kind === "invitation") await clear();
      throw new FixtureGatewayError("reconciliation-required");
    }
  }
  return {
    verify,
    verifyInvitation: (command: unknown, tokenHash: string) =>
      execute("invitation", command, tokenHash),
    setFirstPassword: (command: unknown, password: string) =>
      execute("password", command, password),
    async evidence(input: EvidenceRequest) {
      guard(options.mode);
      const key = keyFor(input.kind, {
        invitationId: input.invitationId,
        operationId: input.operationId,
        expectedBindingRevision: input.expectedBindingRevision,
      });
      const record = checkedOperation(await options.operations.read(key), key);
      if (record.state !== "verified" || record.subject !== input.subject)
        throw new FixtureGatewayError("denied");
      return {
        ...key,
        subject: record.subject,
        evidenceId: record.evidenceId,
        verified: true,
      };
    },
  };
}
