import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { pilotAuthCookieName } from "../../src/lib/auth/config";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
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
  PILOT_OWNER_USER_ID: fixtureOwnerId,
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
    { PILOT_OWNER_USER_ID: "not-a-user-id" },
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
    verify: async () => ({
      data: { user: approvedFixtureUser() },
      error: null,
    }),
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

test("missing PKCE verifier gives browser recovery guidance without admitting a user", async () => {
  let verified = false;
  const { deps } = setup({
    exchange: async () => ({
      error: {
        code: "pkce_code_verifier_not_found",
        message: "must not be exposed",
      },
    }),
    verify: async () => {
      verified = true;
      return { data: { user: approvedFixtureUser() }, error: null };
    },
  });
  const response = await runAuth(
    "callback",
    request("callback", { query: "?code=validcode&locale=en" }),
    deps,
  );
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3103/en/sign-in?state=browser-required",
  );
  assert.equal(verified, false);
  assert.equal(response.cookies.getAll().length, 0);
  assert.ok(!(await response.text()).includes("must not be exposed"));
});
test("verified session never grants workspace authority or exposes identity", async () => {
  const response = await runAuth(
    "session",
    request("session", { query: "?role=owner" }),
    setup().deps,
  );
  assert.deepEqual(await response.json(), {
    authenticated: true,
    approved: true,
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

test("no owner bootstrap means no magic-link request even with a valid address", async () => {
  const { deps, calls } = setup();
  const withoutOwner = { ...input, PILOT_OWNER_USER_ID: undefined };
  const response = await runAuth("sign-in", request("sign-in"), {
    ...deps,
    config: () => parsePilotAuthConfig(withoutOwner),
  });
  assert.match(response.headers.get("location")!, /state=sent/);
  assert.equal(calls.length, 0);
});

for (const [name, change] of [
  ["missing approval", null],
  ["pending application", { approval: "pending" }],
  ["rejected application", { approval: "rejected" }],
  ["suspended membership", { membership: "suspended" }],
  ["revoked invitation", { invitation: "revoked" }],
] as const) {
  test(`callback rejects ${name}, revokes the new session, and expires token cookies`, async () => {
    const user = approvedFixtureUser();
    const deniedUser = {
      ...user,
      app_metadata: change
        ? { ggs_pilot: { ...user.app_metadata.ggs_pilot, ...change } }
        : {},
    };
    let revoked = false;
    const { deps } = setup({
      verify: async () => ({ data: { user: deniedUser }, error: null }),
      signOut: async () => {
        revoked = true;
        return { error: null };
      },
    });
    const originalGateway = deps.gateway;
    const response = await runAuth(
      "callback",
      request("callback", { query: "?code=validcode&locale=en" }),
      {
        ...deps,
        gateway: (_request, output) => {
          output.cookies.set(pilotAuthCookieName + ".0", "new-token");
          return originalGateway();
        },
      },
    );
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3103/en/sign-in?state=approval-required",
    );
    assert.equal(revoked, true);
    assert.equal(response.cookies.get(pilotAuthCookieName + ".0")?.value, "");
    assert.equal(response.cookies.get(pilotAuthCookieName + ".0")?.maxAge, 0);
  });
}

test("provider sign-out failure cannot return exchanged tokens after approval denial", async () => {
  const user = { ...approvedFixtureUser(), app_metadata: {} };
  const { deps } = setup({
    verify: async () => ({ data: { user }, error: null }),
    signOut: async () => {
      throw new Error("network");
    },
  });
  const gateway = deps.gateway;
  const response = await runAuth(
    "callback",
    request("callback", { query: "?code=validcode" }),
    {
      ...deps,
      gateway: (_request, output) => {
        output.cookies.set(pilotAuthCookieName, "must-not-reach-browser");
        return gateway();
      },
    },
  );
  assert.match(response.headers.get("location")!, /state=approval-required/);
  assert.equal(response.cookies.get(pilotAuthCookieName)?.value, "");
});

for (const [role, expected] of [
  ["owner", [200, 403, 200]],
  ["admin", [200, 403, 403]],
  ["streamer", [403, 200, 403]],
] as const) {
  test(`protected access endpoint enforces ${role} boundaries without logging out on wrong-role requests`, async () => {
    let revoked = false;
    const { deps } = setup({
      verify: async () => ({
        data: { user: approvedFixtureUser(role) },
        error: null,
      }),
      signOut: async () => {
        revoked = true;
        return { error: null };
      },
    });
    for (const [index, target] of [
      "hq",
      "streamer",
      "pilot-management",
    ].entries()) {
      const response = await runAuth(
        "access",
        request("access", {
          query: `?area=${target}&role=owner&approved=true`,
        }),
        deps,
      );
      assert.equal(response.status, expected[index]);
      assert.deepEqual(await response.json(), {
        allowed: expected[index] === 200,
      });
    }
    assert.equal(revoked, false);
  });
}

test("an approval removed after login is rejected on the next request with the same browser state", async () => {
  let user = approvedFixtureUser();
  const { deps } = setup({
    verify: async () => ({ data: { user }, error: null }),
  });
  assert.equal(
    (
      await runAuth(
        "access",
        request("access", { query: "?area=streamer" }),
        deps,
      )
    ).status,
    200,
  );
  user = {
    ...user,
    app_metadata: {
      ...user.app_metadata,
      ggs_pilot: { ...user.app_metadata.ggs_pilot, membership: "suspended" },
    },
  };
  assert.equal(
    (
      await runAuth(
        "access",
        request("access", { query: "?area=streamer" }),
        deps,
      )
    ).status,
    403,
  );
  const response = await runAuth("session", request("session"), deps);
  assert.deepEqual(await response.json(), {
    authenticated: false,
    workspaceAccess: false,
    accessDenied: true,
  });
});

test("access checks reject missing sessions and malformed targets", async () => {
  const { deps } = setup({
    verify: async () => ({ data: { user: null }, error: null }),
  });
  assert.equal(
    (await runAuth("access", request("access", { query: "?area=hq" }), deps))
      .status,
    401,
  );
  assert.equal(
    (
      await runAuth(
        "access",
        request("access", { query: "?area=constructor" }),
        deps,
      )
    ).status,
    400,
  );
});
