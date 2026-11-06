import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { runLocalSetup } from "../../proposals/streamer-onboarding/local-app-fixture";
import { localSetupEnabled } from "../../src/lib/setup-local/gate";
const env = process.env as Record<string, string | undefined>;
const fixture = {
  NODE_ENV: "development",
  APP_ENV: "test",
  GGS_SETUP_LOCAL_FIXTURE: "fictional-only",
  NEXT_PUBLIC_APP_URL: "http://localhost:3107",
  PILOT_AUTH_ENABLED: "false",
  PILOT_REVIEW_STORAGE_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
};
const prior = Object.fromEntries(Object.keys(fixture).map((k) => [k, env[k]]));
before(() => Object.assign(env, fixture));
after(() => {
  for (const [k, v] of Object.entries(prior)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});
function client() {
  const cookies = new Map<string, string>();
  return {
    cookies,
    async send(
      action: string,
      body: unknown = {},
      headers: Record<string, string> = {},
      method = "POST",
    ) {
      const request = new NextRequest(
        `http://localhost:3107/auth/setup-local/${action}`,
        {
          method,
          headers: {
            host: "localhost:3107",
            origin: "http://localhost:3107",
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
            ...headers,
          },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        },
      );
      for (const [k, v] of cookies) request.cookies.set(k, v);
      const result = await runLocalSetup(request);
      for (const c of result.cookies.getAll()) {
        if (c.maxAge === 0) cookies.delete(c.name);
        else cookies.set(c.name, c.value);
      }
      return result;
    },
  };
}
test("local setup requires every isolation switch and cannot run in production even with the flag", async () => {
  assert.equal(localSetupEnabled(fixture), true);
  for (const key of Object.keys(fixture))
    assert.equal(localSetupEnabled({ ...fixture, [key]: "wrong" }), false, key);
  env.NODE_ENV = "production";
  try {
    assert.equal((await client().send("start")).status, 404);
  } finally {
    env.NODE_ENV = "development";
  }
});
test("local setup rejects foreign origins, forwarded hosts, methods, paths and personal input", async () => {
  const c = client();
  for (const headers of [
    { origin: "https://example.invalid" },
    { "x-forwarded-host": "example.invalid" },
    { host: "example.invalid" },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.ok([403, 404].includes((await c.send("start", {}, headers)).status));
  assert.equal((await c.send("start", {}, {}, "GET")).status, 405);
  assert.equal((await c.send("owner-reset")).status, 404);
  for (const body of [
    { email: "someone@example.invalid" },
    { password: "must-not-collect" },
    { subject: "forged" },
    { profile: { displayName: "Do not store" } },
  ])
    assert.equal((await c.send("start", body)).status, 400);
});
test("fictional local flow is session-isolated, ordered, private and cannot replay completed mutations", async () => {
  const a = client(),
    b = client();
  assert.equal((await a.send("status")).status, 410);
  const response: NextResponse = await a.send("start");
  assert.deepEqual(await response.json(), { stage: "password" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal((await b.send("status")).status, 410);
  assert.equal((await a.send("profile")).status, 409);
  assert.deepEqual(await (await a.send("password")).json(), {
    stage: "profile",
  });
  assert.equal((await a.send("password")).status, 409);
  assert.deepEqual(await (await a.send("profile")).json(), { stage: "review" });
  assert.deepEqual(await (await a.send("finalize")).json(), {
    stage: "complete",
  });
  assert.deepEqual(await (await a.send("password-receipt")).json(), {
    stage: "complete",
  });
  assert.equal((await a.send("profile")).status, 409);
  assert.deepEqual(await (await a.send("status")).json(), {
    stage: "complete",
  });
  assert.deepEqual(await (await a.send("start")).json(), { stage: "password" });
});
test("a forged or copied local session ID without its provider session cannot authenticate", async () => {
  const a = client(),
    b = client();
  await a.send("start");
  b.cookies.set(
    "ggs-local-setup-fictional",
    a.cookies.get("ggs-local-setup-fictional")!,
  );
  assert.equal((await b.send("status")).status, 403);
  b.cookies.set("ggs-local-setup-fictional", "forged");
  assert.equal((await b.send("status")).status, 410);
});
test("local sessions expire without invoking real services or retaining credentials", async () => {
  const c = client();
  await c.send("start");
  const now = Date.now;
  Date.now = () => now() + 31 * 60 * 1000;
  try {
    assert.equal((await c.send("status")).status, 410);
  } finally {
    Date.now = now;
  }
});

test("fictional setup still works after a manual pause longer than one minute", async () => {
  const c = client();
  await c.send("start");
  const now = Date.now;
  Date.now = () => now() + 2 * 60 * 1000;
  try {
    assert.deepEqual(await (await c.send("password")).json(), {
      stage: "profile",
    });
  } finally {
    Date.now = now;
  }
});
