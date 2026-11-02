import { NextRequest, type NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  fixtureProviderOrigin,
  fixtureSetupOrigin,
  type FixtureOperation,
  type FixtureOperationStore,
  type StepKey,
} from "../../proposals/streamer-onboarding/fixture-gateway";
import { fixtureOwnerId } from "./pilot-admissions";
import { runSetupHttpFixture } from "../../proposals/streamer-onboarding/http-fixture";

type Stored = Omit<FixtureOperation, "state"> & {
  state: FixtureOperation["state"] | "ready";
};
export function setupWireFixture(subject: string = randomUUID()) {
  const user = {
    id: subject,
    aud: "authenticated",
    role: "authenticated",
    email: "creator@example.invalid",
    email_confirmed_at: "2020-01-01T00:00:00Z",
    is_anonymous: false,
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const records = new Map<string, Stored>();
  const state = {
    providerCalls: [] as { path: string; method: string }[],
    sqlCalls: [] as unknown[][],
    claims: 0,
    passwordUpdates: 0,
    tokenUses: 0,
    refreshes: 0,
    eligible: true,
    passwordPending: true,
    revoked: false,
    failVerification: false,
    failPassword: false,
    failEvidenceCommit: false,
    foreignSubject: false,
    shortSession: false,
    afterPassword: undefined as (() => void) | undefined,
    bindingRevision: 2,
    membership: "pending",
    profile: null as Record<string, unknown> | null,
  };
  const operations: FixtureOperationStore = {
    async claim(key: StepKey, actor: string | null) {
      state.claims++;
      const row = records.get(key.operationId);
      if (
        !row ||
        !state.eligible ||
        row.kind !== key.kind ||
        row.invitationId !== key.invitationId ||
        row.expectedBindingRevision !== key.expectedBindingRevision ||
        (actor !== null && row.subject !== actor)
      )
        throw new Error("fixture preflight denied");
      if (row.state === "ready") {
        if (key.kind === "password" && !state.passwordPending)
          throw new Error("fixture password step closed");
        row.state = "claimed";
        row.claimId = randomUUID();
      } else if (row.state === "claimed")
        return { ...row, state: "in-flight", claimId: null };
      return { ...row };
    },
    async read(key, actor) {
      const row = records.get(key.operationId);
      return row && row.subject === actor
        ? { ...row, eligible: state.eligible }
        : null;
    },
    async verified(row, id) {
      if (state.failEvidenceCommit || !state.eligible)
        throw new Error("fixture receipt unavailable");
      const current = records.get(row.operationId);
      if (
        !current ||
        current.state !== "claimed" ||
        current.claimId !== row.claimId
      )
        throw new Error("fixture claim drift");
      current.state = "verified";
      current.evidenceId = id;
      current.claimId = null;
    },
    async uncertain(row) {
      const current = records.get(row.operationId);
      if (
        current &&
        current.state === "claimed" &&
        current.claimId === row.claimId
      ) {
        current.state = "reconcile";
        current.evidenceId = null;
        current.claimId = null;
      }
    },
  };
  const jwt = (seconds: number) => {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: subject, exp: Math.floor(Date.now() / 1000) + seconds, iat: Math.floor(Date.now() / 1000) - 5, aud: "authenticated", role: "authenticated" })}.fictional-signature`;
  };
  const issuedAccess = new Set<string>();
  const session = () => {
    const access_token = jwt(state.shortSession ? 1 : 3600);
    issuedAccess.add(access_token);
    return {
      access_token,
      token_type: "bearer",
      refresh_token: "fictional-onboarding-refresh",
      expires_in: state.shortSession ? 1 : 3600,
      user,
    };
  };
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    state.providerCalls.push({ path: url.pathname, method });
    if (
      url.origin !== fixtureProviderOrigin ||
      init?.redirect !== "error" ||
      init?.cache !== "no-store"
    )
      throw new Error("fixture transport not pinned");
    if (url.pathname === "/auth/v1/verify") {
      const body = JSON.parse(String(init?.body));
      if (
        body.type !== "invite" ||
        body.token_hash !== "a".repeat(64) ||
        state.failVerification
      )
        return Response.json(
          { msg: "fictional invalid invitation", code: "otp_expired" },
          { status: 403 },
        );
      state.tokenUses++;
      return Response.json(session());
    }
    if (url.pathname === "/auth/v1/token") {
      state.refreshes++;
      state.shortSession = false;
      return Response.json(session());
    }
    if (url.pathname === "/auth/v1/user") {
      if (state.revoked)
        return Response.json(
          { msg: "fictional revoked", code: "session_not_found" },
          { status: 401 },
        );
      const bearer = new Headers(init?.headers)
        .get("authorization")
        ?.replace(/^Bearer /, "");
      if (!bearer || !issuedAccess.has(bearer))
        return Response.json(
          { msg: "fictional missing session" },
          { status: 401 },
        );
      if (method === "PUT") {
        state.passwordUpdates++;
        state.afterPassword?.();
        const body = JSON.parse(String(init?.body));
        if (typeof body.password !== "string" || state.failPassword)
          return Response.json(
            { msg: "fictional password failure" },
            { status: 422 },
          );
      }
      return Response.json({
        ...user,
        id: state.foreignSubject ? randomUUID() : subject,
      });
    }
    if (url.pathname === "/auth/v1/logout")
      return new Response(null, { status: 204 });
    throw new Error("Unexpected fixture provider path");
  };
  const setup = {
    query: async (sql: string, values: unknown[]) => {
      state.sqlCalls.push(values);
      if (state.revoked || values[0] !== subject) throw { code: "42501" };
      if (!sql.includes("setup_transition"))
        throw new Error("Unexpected fixture SQL");
      const action = values[4];
      if (action === "profile") {
        const { expectedProfileRevision, ...fields } = JSON.parse(
          String(values[5]),
        );
        void expectedProfileRevision;
        state.profile = { ...fields, revision: 1 };
      }
      if (action === "password") state.passwordPending = false;
      if (action === "finalize") state.membership = "active";
      state.bindingRevision = Number(values[3]) + 1;
      return { rows: [{ revision: state.bindingRevision }] };
    },
  };
  const reader = {
    query: async (_sql: string, values: unknown[]) => {
      state.sqlCalls.push(values);
      if (state.revoked || values[0] !== subject) throw { code: "42501" };
      return {
        rows: [
          {
            result: {
              membership: state.membership,
              bindingRevision: state.bindingRevision,
              profile: state.profile,
            },
          },
        ],
      };
    },
  };
  function seed(
    kind: StepKey["kind"],
    invitationId: string,
    expectedBindingRevision: number,
    operationId: string = randomUUID(),
  ) {
    const key = { kind, invitationId, expectedBindingRevision, operationId };
    records.set(operationId, {
      ...key,
      subject,
      state: "ready",
      evidenceId: null,
      claimId: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      eligible: true,
      role: "streamer",
    });
    return { invitationId, expectedBindingRevision, operationId };
  }
  return {
    state,
    user,
    records,
    seed,
    operations,
    fixtureFetch,
    deps: {
      mode: "isolated-fixture" as const,
      ownerUserId: fixtureOwnerId,
      operations,
      fixtureFetch,
      setup,
      reader,
    },
  };
}
export function setupRequest(
  action: string,
  body: unknown,
  cookies: NextResponse["cookies"] | undefined = undefined,
  headers: Record<string, string> = {},
) {
  const request = new NextRequest(
    `${fixtureSetupOrigin}/auth/setup/${action}`,
    {
      method: "POST",
      headers: {
        origin: fixtureSetupOrigin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
  for (const cookie of cookies?.getAll() ?? [])
    if (cookie.value && cookie.maxAge !== 0)
      request.cookies.set(cookie.name, cookie.value);
  return request;
}
export function setupHttpClient(
  deps: Parameters<typeof runSetupHttpFixture>[1],
) {
  const jar = new Map<string, string>();
  return {
    jar,
    async send(
      action: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) {
      const request = setupRequest(action, body, undefined, headers);
      for (const [name, value] of jar) request.cookies.set(name, value);
      const response = await runSetupHttpFixture(request, deps);
      for (const cookie of response.cookies.getAll()) {
        if (cookie.maxAge === 0 || !cookie.value) jar.delete(cookie.name);
        else jar.set(cookie.name, cookie.value);
      }
      return response;
    },
  };
}
