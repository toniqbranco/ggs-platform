import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { runSetupHttpFixture } from "../../proposals/streamer-onboarding/http-fixture";
import {
  fixtureCookieName,
  fixtureSetupOrigin,
} from "../../proposals/streamer-onboarding/fixture-gateway";
import {
  setupWireFixture,
  setupHttpClient,
  setupRequest,
} from "../fixtures/onboarding-wire";
import { fixtureOwnerId } from "../fixtures/pilot-admissions";
const env = process.env as Record<string, string | undefined>;
const priorApp = env.APP_ENV,
  priorNode = env.NODE_ENV;
before(() => {
  env.APP_ENV = "test";
  delete env.NODE_ENV;
});
after(() => {
  if (priorApp === undefined) delete env.APP_ENV;
  else env.APP_ENV = priorApp;
  if (priorNode === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = priorNode;
});
const tokenHash = "a".repeat(64),
  password = "Fictional-Setup-Password-Only";
async function begin(wire = setupWireFixture()) {
  const client = setupHttpClient(wire.deps);
  const binding = randomUUID();
  const command = wire.seed("invitation", binding, 2);
  const response = await client.send("invitation", { ...command, tokenHash });
  assert.equal(response.status, 200);
  return { wire, client, binding, command, response };
}
test("actual SSR SDK verifies only invitation type and writes isolated HttpOnly cookies", async () => {
  const { wire, response } = await begin();
  assert.equal(wire.state.tokenUses, 1);
  assert.deepEqual(await response.json(), { revision: 3 });
  const cookies = response.cookies.getAll();
  assert.ok(cookies.length > 0);
  for (const cookie of cookies) {
    assert.ok(cookie.name.startsWith(fixtureCookieName));
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.path, "/");
  }
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("vary"), "Cookie");
});
test("HTTP fixture completes password/profile/finalization while workspace access remains false", async () => {
  const { wire, client, binding } = await begin();
  const passwordCommand = wire.seed("password", binding, 3);
  const response = await client.send("password", {
    ...passwordCommand,
    newPassword: password,
    confirmPassword: password,
  });
  assert.equal(response.status, 200);
  assert.equal(wire.state.passwordUpdates, 1);
  assert.deepEqual(await response.json(), { revision: 4 });
  assert.equal(
    (
      await client.send("profile", {
        invitationId: binding,
        operationId: randomUUID(),
        expectedBindingRevision: 4,
        expectedProfileRevision: 0,
        displayName: "Creator Demo",
        country: "Colombia",
        platform: "twitch",
        profileUrl: "https://example.invalid/creator",
        locale: "es",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await client.send("finalize", {
        invitationId: binding,
        operationId: randomUUID(),
        expectedBindingRevision: 5,
      })
    ).status,
    200,
  );
  const status = await client.send("status", { invitationId: binding });
  const body = await status.json();
  assert.equal(body.membership, "active");
  assert.equal(body.workspaceAccess, false);
  assert.equal(JSON.stringify(body).includes(password), false);
});
for (const variant of ["disabled", "development", "production"] as const)
  test(`${variant} mode performs no SDK, ledger or SQL work`, async () => {
    const wire = setupWireFixture();
    const deps = {
      ...wire.deps,
      mode:
        variant === "disabled"
          ? ("disabled" as const)
          : ("isolated-fixture" as const),
    };
    if (variant === "development") env.APP_ENV = "development";
    if (variant === "production") env.NODE_ENV = "production";
    try {
      assert.equal(
        (await runSetupHttpFixture(setupRequest("invitation", {}), deps))
          .status,
        503,
      );
    } finally {
      env.APP_ENV = "test";
      delete env.NODE_ENV;
    }
    assert.equal(wire.state.providerCalls.length, 0);
    assert.equal(wire.state.claims, 0);
    assert.equal(wire.state.sqlCalls.length, 0);
  });
for (const headers of [
  { origin: "https://foreign.example.invalid" },
  { "sec-fetch-site": "cross-site" },
  { origin: "null" },
])
  test(`cross-site request fails before dependencies: ${JSON.stringify(headers)}`, async () => {
    const wire = setupWireFixture();
    assert.equal(
      (
        await runSetupHttpFixture(
          setupRequest("password", {}, undefined, headers),
          wire.deps,
        )
      ).status,
      403,
    );
    assert.equal(wire.state.providerCalls.length, 0);
    assert.equal(wire.state.claims, 0);
  });
test("GET links and token-bearing URLs never consume invitations or redirect", async () => {
  const wire = setupWireFixture();
  const get = await runSetupHttpFixture(
    new NextRequest(
      `${fixtureSetupOrigin}/auth/setup/invitation?token_hash=${tokenHash}`,
    ),
    wire.deps,
  );
  assert.equal(get.status, 405);
  const post = setupRequest("invitation", {});
  const withQuery = new NextRequest(
    post.url + "?next=https://foreign.example.invalid",
    post,
  );
  const response = await runSetupHttpFixture(withQuery, wire.deps);
  assert.equal(response.status, 403);
  assert.equal(response.headers.has("location"), false);
  assert.equal(wire.state.tokenUses, 0);
});
test("declared/streamed oversized, malformed and wrong-content-type bodies fail before SDK", async () => {
  const wire = setupWireFixture();
  assert.equal(
    (
      await runSetupHttpFixture(
        setupRequest("password", {}, undefined, { "content-length": "9000" }),
        wire.deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await runSetupHttpFixture(
        setupRequest("password", { extra: "x".repeat(9000) }),
        wire.deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await runSetupHttpFixture(
        setupRequest("password", {}, undefined, {
          "content-type": "text/plain",
        }),
        wire.deps,
      )
    ).status,
    415,
  );
  const invalid = new NextRequest(`${fixtureSetupOrigin}/auth/setup/password`, {
    method: "POST",
    headers: {
      origin: fixtureSetupOrigin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: "{",
  });
  assert.equal((await runSetupHttpFixture(invalid, wire.deps)).status, 400);
  assert.equal(wire.state.providerCalls.length, 0);
});
test("unknown subject/evidence/role/return fields cannot enter the request protocol", async () => {
  const wire = setupWireFixture();
  const command = wire.seed("invitation", randomUUID(), 2);
  for (const field of [
    "subject",
    "role",
    "evidenceId",
    "next",
    "app_metadata",
  ]) {
    const result = await runSetupHttpFixture(
      setupRequest("invitation", { ...command, tokenHash, [field]: "forged" }),
      wire.deps,
    );
    assert.equal(result.status, 400);
  }
  assert.equal(wire.state.claims, 0);
  assert.equal(wire.state.tokenUses, 0);
});
test("same-browser invitation reconciliation uses command-only evidence without another token verification", async () => {
  const { wire, client, command } = await begin();
  assert.equal(
    (await client.send("invitation", { ...command, tokenHash })).status,
    409,
  );
  const receipt = await client.send("invitation-receipt", command);
  assert.equal(receipt.status, 200);
  assert.equal((await receipt.json()).receipt, true);
  assert.equal(wire.state.tokenUses, 1);
  client.jar.clear();
  assert.equal(
    (await client.send("invitation", { ...command, tokenHash })).status,
    403,
  );
  assert.equal(wire.state.tokenUses, 1);
});
test("a changed password cannot be falsely acknowledged through a completed operation", async () => {
  const { wire, client, binding } = await begin();
  const command = wire.seed("password", binding, 3);
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: password,
      })
    ).status,
    200,
  );
  const changed = "Different-Fictional-Password-Only";
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: changed,
        confirmPassword: changed,
      })
    ).status,
    409,
  );
  assert.equal(wire.state.passwordUpdates, 1);
  assert.equal(
    (
      await client.send("password-receipt", {
        ...command,
        newPassword: changed,
      })
    ).status,
    400,
  );
  const receipt = await client.send("password-receipt", command);
  assert.equal(receipt.status, 200);
  assert.equal((await receipt.json()).receipt, true);
  assert.equal(wire.state.passwordUpdates, 1);
});

test("provider failure marks reconciliation and blocks repeated invitation verification", async () => {
  const wire = setupWireFixture();
  wire.state.failVerification = true;
  const client = setupHttpClient(wire.deps),
    command = wire.seed("invitation", randomUUID(), 2);
  const first = await client.send("invitation", { ...command, tokenHash });
  assert.equal(first.status, 409);
  const requests = wire.state.providerCalls.filter((call) =>
    call.path.endsWith("verify"),
  ).length;
  assert.equal(
    (await client.send("invitation", { ...command, tokenHash })).status,
    409,
  );
  assert.equal(
    wire.state.providerCalls.filter((call) => call.path.endsWith("verify"))
      .length,
    requests,
  );
  assert.equal(wire.state.sqlCalls.length, 0);
});
test("foreign verified subject clears newly issued fixture cookies and never writes SQL", async () => {
  const wire = setupWireFixture();
  wire.state.foreignSubject = true;
  const command = wire.seed("invitation", randomUUID(), 2);
  const response = await runSetupHttpFixture(
    setupRequest("invitation", { ...command, tokenHash }),
    wire.deps,
  );
  assert.equal(response.status, 409);
  assert.ok(response.cookies.getAll().every((cookie) => cookie.maxAge === 0));
  assert.equal(wire.state.sqlCalls.length, 0);
});
test("password preflight denial and completed step never call SDK updateUser", async () => {
  const { wire, client, binding } = await begin();
  const command = wire.seed("password", binding, 3);
  wire.state.eligible = false;
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: password,
      })
    ).status,
    503,
  );
  assert.equal(wire.state.passwordUpdates, 0);
  wire.state.eligible = true;
  wire.state.passwordPending = false;
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: password,
      })
    ).status,
    503,
  );
  assert.equal(wire.state.passwordUpdates, 0);
});
test("password confirmation and conservative UTF-8 bounds reject before preflight", async () => {
  const { wire, client, binding } = await begin();
  const command = wire.seed("password", binding, 3);
  const before = wire.state.claims;
  for (const secret of [
    "short",
    "a".repeat(73),
    "🔒".repeat(19),
    "valid-long\0-secret",
  ])
    assert.equal(
      (
        await client.send("password", {
          ...command,
          newPassword: secret,
          confirmPassword: secret,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: "mismatch",
      })
    ).status,
    400,
  );
  assert.equal(wire.state.claims, before);
  assert.equal(wire.state.passwordUpdates, 0);
});
test("password success followed by evidence persistence failure is not automatically repeated", async () => {
  const { wire, client, binding } = await begin();
  const command = wire.seed("password", binding, 3);
  wire.state.failEvidenceCommit = true;
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: password,
      })
    ).status,
    409,
  );
  assert.equal(wire.state.passwordUpdates, 1);
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: password,
      })
    ).status,
    409,
  );
  assert.equal(wire.state.passwordUpdates, 1);
});
test("revocation during a simulated password update prevents SQL receipt and activation", async () => {
  const { wire, client, binding } = await begin();
  const command = wire.seed("password", binding, 3);
  wire.state.afterPassword = () => {
    wire.state.eligible = false;
  };
  assert.equal(
    (
      await client.send("password", {
        ...command,
        newPassword: password,
        confirmPassword: password,
      })
    ).status,
    409,
  );
  assert.equal(wire.state.sqlCalls.length, 1);
  assert.equal(wire.state.membership, "pending");
});
test("SDK refresh writes replacement cookies to the returned HTTP response", async () => {
  const wire = setupWireFixture();
  wire.state.shortSession = true;
  const { response } = await begin(wire);
  assert.equal(response.status, 200);
  assert.ok(wire.state.refreshes >= 1);
  assert.ok(response.cookies.getAll().length > 0);
  const stored = response.cookies
    .getAll()
    .filter(
      (c) =>
        c.name === fixtureCookieName ||
        c.name.startsWith(fixtureCookieName + "."),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((c) => c.value)
    .join("");
  assert.ok(stored.startsWith("base64-"));
  const session = JSON.parse(
    Buffer.from(stored.slice(7), "base64url").toString("utf8"),
  );
  assert.ok(session.expires_at > Math.floor(Date.now() / 1000) + 60);
});
test("a stalled body has a deadline and cancellation before any provider work", async () => {
  const wire = setupWireFixture();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
    },
    cancel() {
      cancelled = true;
    },
  });
  const init = {
    method: "POST",
    headers: {
      origin: fixtureSetupOrigin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body,
    duplex: "half" as const,
  };
  const request = new NextRequest(
    `${fixtureSetupOrigin}/auth/setup/password`,
    init,
  );
  assert.equal((await runSetupHttpFixture(request, wire.deps)).status, 400);
  assert.equal(cancelled, true);
  assert.equal(wire.state.providerCalls.length, 0);
});
test("a forged session cookie cannot replace server verification", async () => {
  const { wire, client, binding } = await begin();
  const before = wire.state.sqlCalls.length;
  const stored = [...client.jar.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, value]) => value)
    .join("");
  const session = JSON.parse(
    Buffer.from(stored.slice(7), "base64url").toString("utf8"),
  );
  session.access_token =
    session.access_token.split(".").slice(0, 2).join(".") + ".forged";
  client.jar.clear();
  client.jar.set(
    fixtureCookieName,
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
  );
  assert.equal(
    (await client.send("status", { invitationId: binding })).status,
    403,
  );
  assert.equal(wire.state.sqlCalls.length, before);
});
test("configured owner cannot consume a new-streamer invitation", async () => {
  const wire = setupWireFixture(fixtureOwnerId),
    command = wire.seed("invitation", randomUUID(), 2);
  assert.equal(
    (
      await runSetupHttpFixture(
        setupRequest("invitation", { ...command, tokenHash }),
        wire.deps,
      )
    ).status,
    403,
  );
  assert.equal(wire.state.tokenUses, 0);
});
test("expired server preflight blocks the provider before token consumption", async () => {
  const wire = setupWireFixture(),
    command = wire.seed("invitation", randomUUID(), 2);
  wire.records.get(command.operationId)!.expiresAt = "2020-01-01T00:00:00Z";
  assert.equal(
    (
      await runSetupHttpFixture(
        setupRequest("invitation", { ...command, tokenHash }),
        wire.deps,
      )
    ).status,
    403,
  );
  assert.equal(wire.state.providerCalls.length, 0);
});
test("competing initial requests cannot both consume one invitation", async () => {
  const wire = setupWireFixture(),
    command = wire.seed("invitation", randomUUID(), 2);
  const responses = await Promise.all([
    runSetupHttpFixture(
      setupRequest("invitation", { ...command, tokenHash }),
      wire.deps,
    ),
    runSetupHttpFixture(
      setupRequest("invitation", { ...command, tokenHash }),
      wire.deps,
    ),
  ]);
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    1,
  );
  assert.equal(wire.state.tokenUses, 1);
});
test("a provider redirect never follows to another origin", async () => {
  const wire = setupWireFixture(),
    command = wire.seed("invitation", randomUUID(), 2);
  const origins: string[] = [];
  const deps = {
    ...wire.deps,
    fixtureFetch: (async (input) => {
      origins.push(new URL(String(input)).origin);
      return Response.redirect("https://foreign.example.invalid", 302);
    }) as typeof fetch,
  };
  assert.equal(
    (
      await runSetupHttpFixture(
        setupRequest("invitation", { ...command, tokenHash }),
        deps,
      )
    ).status,
    409,
  );
  assert.ok(
    origins.every((origin) => origin === "https://onboarding.example.invalid"),
  );
  assert.equal(wire.state.sqlCalls.length, 0);
});
