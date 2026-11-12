import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import {
  handlePilotSetupStatus,
  readPilotSetupStatus,
} from "../../src/lib/pilot/setup-status";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
import {
  approvedPilotOrigin,
  pilotAuthCookieName,
} from "../../src/lib/auth/config";

test("pilot setup status uses fresh provider identity and exposes only the scoped progress", async (t) => {
  const user = approvedFixtureUser("streamer");
  const scope = {
    subject: user.id,
    invitationId: "00000000-0000-4000-8000-000000000010",
    applicationId: "00000000-0000-4000-8000-000000000013",
    applicationRevision: 2,
  };
  const origin = "http://127.0.0.1:3103";
  const env = {
    APP_ENV: "test",
    NODE_ENV: "development",
    GGS_PILOT_SETUP_ENABLED: "single-streamer",
    PILOT_AUTH_ENABLED: "true",
    PILOT_OWNER_USER_ID: fixtureOwnerId,
    PILOT_SUPABASE_URL: approvedPilotOrigin,
    PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
    NEXT_PUBLIC_APP_URL: origin,
    GGS_PILOT_SETUP_SUBJECT_ID: scope.subject,
    GGS_PILOT_SETUP_INVITATION_ID: scope.invitationId,
    GGS_PILOT_SETUP_APPLICATION_ID: scope.applicationId,
    GGS_PILOT_SETUP_APPLICATION_REVISION: "2",
    NODE_TLS_REJECT_UNAUTHORIZED: "1",
  };
  const runtime = process.env as Record<string, string | undefined>;
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, runtime[key]]),
  );
  Object.assign(runtime, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete runtime[key];
      else runtime[key] = value;
    }
  });
  let subject = user.id;
  let providerCalls = 0;
  let reads = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, options: RequestInit) => {
      providerCalls++;
      assert.equal(String(url), approvedPilotOrigin + "/auth/v1/user");
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      return Response.json({ ...user, id: subject });
    },
  );
  const read: typeof readPilotSetupStatus = (request, response, config) =>
    readPilotSetupStatus(request, response, config, async (sql, values) => {
      reads++;
      assert.deepEqual(values, [scope.subject, scope.invitationId]);
      if (sql.includes("read_approved_binding"))
        return {
          rows: [
            {
              result: {
                ...scope,
                approval: "approved",
                decidedBy: fixtureOwnerId,
              },
            },
          ],
        };
      assert.match(sql, /read_self/);
      return {
        rows: [
          {
            result: {
              membership: "pending",
              bindingRevision: 3,
              profile: null,
            },
          },
        ],
      };
    });
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    part({ alg: "HS256", typ: "JWT" }),
    part({ sub: user.id, exp }),
    "fixture",
  ].join(".");
  const cookie =
    "base64-" +
    part({
      access_token: token,
      refresh_token: "fixture-refresh",
      expires_at: exp,
      user,
    });
  function request(headers: Record<string, string> = {}, body = "{}") {
    const value = new NextRequest(origin + "/auth/setup-status", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3103",
        origin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      body,
    });
    value.cookies.set(pilotAuthCookieName, cookie);
    return value;
  }
  delete runtime.GGS_PILOT_SETUP_ENABLED;
  assert.equal((await handlePilotSetupStatus(request(), read)).status, 404);
  runtime.GGS_PILOT_SETUP_ENABLED = "single-streamer";
  assert.equal(
    (
      await handlePilotSetupStatus(
        request({ origin: "https://example.invalid" }),
        read,
      )
    ).status,
    403,
  );
  assert.equal(providerCalls, 0);
  assert.equal(
    (await handlePilotSetupStatus(request({}, '{"subject":"other"}'), read))
      .status,
    400,
  );
  assert.equal(providerCalls, 0);
  const allowed = await handlePilotSetupStatus(request(), read);
  assert.deepEqual(await allowed.json(), { status: "pending" });
  assert.match(allowed.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(reads, 2);
  subject = fixtureOwnerId;
  assert.equal((await handlePilotSetupStatus(request(), read)).status, 403);
  assert.equal(providerCalls, 2);
  assert.equal(reads, 2);
});
