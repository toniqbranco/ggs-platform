import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  approvedPilotOrigin,
  parsePilotAuthConfig,
} from "../../src/lib/auth/config";
import {
  runAuth,
  type AuthGateway,
  type AuthOperation,
} from "../../src/lib/auth/flow";

const input = {
  PILOT_AUTH_ENABLED: "true",
  PILOT_SUPABASE_URL: approvedPilotOrigin,
  PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_not_real",
  NEXT_PUBLIC_APP_URL: "http://localhost:3103",
  APP_ENV: "test",
};
const config = parsePilotAuthConfig(input);
test("pilot authentication defaults off and targets only the approved test project", () => {
  assert.deepEqual(parsePilotAuthConfig({}), { enabled: false });
  assert.equal(config.enabled, true);
  for (const change of [
    { APP_ENV: "production" },
    { PILOT_SUPABASE_URL: "https://other.supabase.co" },
    { PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" },
    { PILOT_AUTH_ENABLED: "yes" },
    { NEXT_PUBLIC_APP_URL: "https://user:password@example.invalid" },
    { NEXT_PUBLIC_APP_URL: "javascript:alert(1)" },
  ]) {
    assert.throws(() => parsePilotAuthConfig({ ...input, ...change }));
  }
});

function setup(overrides: Partial<AuthGateway> = {}) {
  const calls: unknown[][] = [];
  const gateway: AuthGateway = {
    requestLink: async (...args) => {
      calls.push(args);
      return { error: null };
    },
    exchange: async (code) => {
      calls.push([code]);
      return { error: null };
    },
    verify: async () => ({ data: { user: { id: "synthetic" } }, error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  };
  return { calls, deps: { config: () => config, gateway: () => gateway } };
}
function request(
  operation: AuthOperation,
  options: {
    body?: string;
    origin?: string;
    query?: string;
    type?: string;
  } = {},
) {
  const post = operation === "sign-in" || operation === "sign-out";
  return new NextRequest(
    `http://localhost:3103/auth/${operation}${options.query ?? ""}`,
    post
      ? {
          method: "POST",
          headers: {
            origin: options.origin ?? "http://localhost:3103",
            "content-type": options.type ?? "application/x-www-form-urlencoded",
          },
          body: options.body ?? "locale=en&email=synthetic%40example.invalid",
        }
      : undefined,
  );
}
test("disabled authentication never creates a client", async () => {
  const response = await runAuth("session", request("session"), {
    config: () => ({ enabled: false }),
    gateway: () => {
      throw new Error("called");
    },
  });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
});
for (const operation of ["sign-in", "sign-out"] as const) {
  test(`${operation} rejects cross-origin submission before auth work`, async () => {
    const { deps, calls } = setup();
    const response = await runAuth(
      operation,
      request(operation, { origin: "https://attacker.invalid" }),
      deps,
    );
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  });
}
test("sign-in rejects invalid emails, unsupported body types, and oversized bodies", async () => {
  const { deps, calls } = setup();
  assert.match(
    (
      await runAuth(
        "sign-in",
        request("sign-in", { body: "locale=en&email=bad" }),
        deps,
      )
    ).headers.get("location")!,
    /state=invalid/,
  );
  assert.equal(
    (
      await runAuth(
        "sign-in",
        request("sign-in", { type: "application/json" }),
        deps,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await runAuth(
        "sign-in",
        request("sign-in", { body: "x=" + "a".repeat(5000) }),
        deps,
      )
    ).status,
    413,
  );
  assert.equal(calls.length, 0);
});
test("sign-in fixes callback origin/locale and ignores external next URLs", async () => {
  const { deps, calls } = setup();
  const response = await runAuth(
    "sign-in",
    request("sign-in", {
      body: "locale=en&email=synthetic%40example.invalid&next=https://attacker.invalid",
    }),
    deps,
  );
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3103/en/sign-in?state=sent",
  );
  assert.deepEqual(calls, [
    [
      "synthetic@example.invalid",
      "http://localhost:3103/auth/callback?locale=en",
    ],
  ]);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
test("known, unknown, and provider-failure responses do not reveal account existence", async () => {
  for (const requestLink of [
    async () => ({ error: null }),
    async () => ({ error: new Error("unknown address") }),
    async () => {
      throw new Error("network");
    },
  ]) {
    const { deps } = setup({ requestLink });
    const response = await runAuth("sign-in", request("sign-in"), deps);
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location")!, /state=sent$/);
    assert.ok(!(await response.text()).includes("address"));
  }
});
for (const query of ["", "?code=short", "?code=validcode&error=denied"]) {
  test(`invalid callback ${query} fails before token exchange`, async () => {
    const { deps, calls } = setup();
    assert.match(
      (
        await runAuth("callback", request("callback", { query }), deps)
      ).headers.get("location")!,
      /state=expired/,
    );
    assert.equal(calls.length, 0);
  });
}
test("callback checks exchanged identity and never trusts query role/next", async () => {
  const { deps } = setup();
  const response = await runAuth(
    "callback",
    request("callback", {
      query:
        "?code=validcode&locale=en&role=owner&next=https://attacker.invalid",
    }),
    deps,
  );
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3103/en/session",
  );
  for (const overrides of [
    { exchange: async () => ({ error: new Error("expired") }) },
    { verify: async () => ({ data: { user: null }, error: null }) },
  ]) {
    assert.match(
      (
        await runAuth(
          "callback",
          request("callback", { query: "?code=validcode" }),
          setup(overrides).deps,
        )
      ).headers.get("location")!,
      /state=expired/,
    );
  }
});
test("verified session never grants workspace authority or exposes identity", async () => {
  const response = await runAuth(
    "session",
    request("session", { query: "?role=owner" }),
    setup().deps,
  );
  assert.deepEqual(await response.json(), {
    authenticated: true,
    workspaceAccess: false,
  });
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
test("expired/revoked sessions fail closed and provider errors stay generic", async () => {
  const absent = await runAuth(
    "session",
    request("session"),
    setup({
      verify: async () => ({
        data: { user: null },
        error: new Error("revoked"),
      }),
    }).deps,
  );
  assert.deepEqual(await absent.json(), {
    authenticated: false,
    workspaceAccess: false,
  });
  const unavailable = await runAuth(
    "session",
    request("session"),
    setup({
      verify: async () => {
        throw new Error("private provider details");
      },
    }).deps,
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "unavailable" });
});
test("sign-out confirms only success and redirects locally", async () => {
  const response = await runAuth(
    "sign-out",
    request("sign-out", { body: "locale=en" }),
    setup().deps,
  );
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3103/en/sign-in?state=signed-out",
  );
  const failed = await runAuth(
    "sign-out",
    request("sign-out"),
    setup({ signOut: async () => ({ error: new Error("failure") }) }).deps,
  );
  assert.match(failed.headers.get("location")!, /state=unavailable/);
});
