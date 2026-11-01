import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { runStoredReview } from "../../src/lib/pilot/stored-review-route";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
import { parseServerEnvironment } from "../../src/lib/env/schema";
import { storedApplicationSchema } from "../../src/lib/pilot/stored-review-contract";

function setup() {
  const state = {
    user: approvedFixtureUser("owner") as ReturnType<
      typeof approvedFixtureUser
    > | null,
    reads: 0,
    verifies: 0,
    enabled: true,
    fail: false,
    actor: "",
  };
  const deps = {
    enabled: () => state.enabled,
    config: () => ({
      enabled: true as const,
      url: "https://rchxnmpsxfbsicthasxn.supabase.co",
      publishableKey: "sb_publishable_fixture_only",
      appOrigin: "http://localhost:3000",
      ownerUserId: fixtureOwnerId,
    }),
    gateway: (
      _request: NextRequest,
      response: import("next/server").NextResponse,
    ) => ({
      verify: async () => {
        state.verifies++;
        response.cookies.set("refresh-fixture", "refreshed", {
          httpOnly: true,
        });
        return { data: { user: state.user }, error: null };
      },
      signOut: async () => ({ error: null }),
      requestLink: async () => ({ error: null }),
      exchange: async () => ({ error: null }),
    }),
    read: async (_input: unknown, actor: string) => {
      state.reads++;
      state.actor = actor;
      if (state.fail) throw Error("sensitive fixture diagnostics");
      return {
        applications: [],
        bounded: true as const,
        internalSecret: "must-not-return",
      };
    },
  };
  const request = (
    query = "operation=list",
    headers: Record<string, string> = {},
  ) =>
    new NextRequest(`http://localhost:3000/auth/application-review?${query}`, {
      headers,
    });
  return { state, deps, request };
}
test("stored review defaults off and cannot be enabled for staging/production or a remote origin", () => {
  assert.equal(
    parseServerEnvironment({}).PILOT_REVIEW_STORAGE_ENABLED,
    "false",
  );
  for (const change of [
    { APP_ENV: "staging" },
    { APP_ENV: "production" },
    { NEXT_PUBLIC_APP_URL: "https://example.invalid" },
  ]) {
    assert.throws(() =>
      parseServerEnvironment({
        PILOT_REVIEW_STORAGE_ENABLED: "true",
        ...change,
      }),
    );
  }
});
test("disabled route performs no authentication or credential/database work", async () => {
  const { state, deps, request } = setup();
  state.enabled = false;
  assert.equal((await runStoredReview(request(), deps)).status, 503);
  assert.equal(state.reads, 0);
  assert.equal(state.verifies, 0);
});
for (const role of [null, "streamer", "admin"] as const)
  test(`stored data denied before storage for ${role ?? "anonymous"}`, async () => {
    const { state, deps, request } = setup();
    state.user = role ? approvedFixtureUser(role) : null;
    const response = await runStoredReview(request(), deps);
    assert.ok([401, 403].includes(response.status));
    assert.equal(state.reads, 0);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  });
test("fresh owner verified on every request; revoked membership fails before a second read", async () => {
  const { state, deps, request } = setup();
  const first = await runStoredReview(request(), deps);
  assert.equal(first.status, 200);
  assert.equal(state.actor, fixtureOwnerId);
  assert.equal(first.cookies.get("refresh-fixture")?.value, "refreshed");
  assert.equal(first.headers.get("vary"), "Cookie");
  assert.deepEqual(await first.json(), {
    mode: "stored-readonly",
    applications: [],
    bounded: true,
  });
  state.user!.app_metadata.ggs_pilot.membership = "suspended";
  assert.equal((await runStoredReview(request(), deps)).status, 403);
  assert.equal(state.reads, 1);
  assert.equal(state.verifies, 2);
});
for (const query of [
  "operation=list&actor=forged",
  "operation=list&operation=history",
  "operation=decide",
  "operation=history&applicationId=bad",
  "operation=list&area=streamer",
])
  test(`invalid input cannot reach stored review: ${query}`, async () => {
    const { state, deps, request } = setup();
    assert.equal((await runStoredReview(request(query), deps)).status, 400);
    assert.equal(state.reads, 0);
  });
test("cross-site request rejected and database failures return only controlled errors", async () => {
  const { state, deps, request } = setup();
  assert.equal(
    (
      await runStoredReview(
        request("operation=list", { origin: "https://example.invalid" }),
        deps,
      )
    ).status,
    403,
  );
  assert.equal(state.reads, 0);
  state.fail = true;
  const response = await runStoredReview(request(), deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "unavailable" });
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
test("unsafe stored profile URLs are never rendered as links", () => {
  const base = {
    id: fixtureOwnerId,
    name: "Fixture",
    email: "fixture@example.invalid",
    country: "Colombia",
    platform: "twitch",
    locale: "es",
    state: "pending",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
  };
  for (const profile of [
    "javascript:alert(1)",
    "https://user:password@example.invalid",
    "http://example.invalid",
  ])
    assert.equal(
      storedApplicationSchema.safeParse({ ...base, profile }).success,
      false,
    );
});
