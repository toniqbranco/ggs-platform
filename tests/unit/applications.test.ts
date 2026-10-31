import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  applicationSchema,
  previewDecision,
} from "../../src/lib/pilot/applications";
import { runReviewPreview } from "../../src/lib/pilot/review-preview";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
import {
  parsePilotAuthConfig,
  approvedPilotOrigin,
} from "../../src/lib/auth/config";
import type { AuthGateway } from "../../src/lib/auth/flow";

const sample = {
  name: "Creator Demo",
  email: "creator@example.invalid",
  country: "Colombia",
  platform: "tiktok",
  profile: "https://example.invalid/creator",
};
test("application validation rejects injected approval, oversized fields, credentials, and unsafe links", () => {
  assert.equal(applicationSchema.safeParse(sample).success, true);
  for (const change of [
    { name: " " },
    { email: "invalid" },
    { country: "" },
    { platform: "owner" },
    { profile: "javascript:alert(1)" },
    { profile: "http://example.invalid" },
    { profile: "https://user:password@example.invalid" },
    { name: "x".repeat(81) },
    { roles: ["owner"] },
    { approval: "approved" },
  ]) {
    assert.equal(
      applicationSchema.safeParse({ ...sample, ...change }).success,
      false,
    );
  }
});
test("rehearsal decisions are terminal until explicit preview reset", () => {
  assert.equal(previewDecision("pending", "approved"), "approved");
  assert.equal(previewDecision("pending", "rejected"), "rejected");
  assert.equal(previewDecision("approved", "rejected"), "approved");
  assert.equal(previewDecision("rejected", "approved"), "rejected");
});

const config = parsePilotAuthConfig({
  PILOT_AUTH_ENABLED: "true",
  APP_ENV: "test",
  PILOT_SUPABASE_URL: approvedPilotOrigin,
  PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
  NEXT_PUBLIC_APP_URL: "http://localhost:3103",
  PILOT_OWNER_USER_ID: fixtureOwnerId,
});
const request = () =>
  new NextRequest(
    "http://localhost:3103/auth/review-preview?area=streamer&role=owner",
    { headers: { cookie: "pilot-role=owner" } },
  );
for (const role of ["owner", "admin", "streamer"] as const) {
  test(`review data requires owner authority, checking ${role}`, async () => {
    const user = approvedFixtureUser(role);
    let calls = 0;
    const gateway: AuthGateway = {
      verify: async () => {
        calls++;
        return { data: { user }, error: null };
      },
      signOut: async () => ({ error: null }),
      exchange: async () => {
        throw new Error("unexpected exchange");
      },
      requestLink: async () => {
        throw new Error("unexpected email");
      },
    };
    const deps = { config: () => config, gateway: () => gateway };
    const response = await runReviewPreview(request(), deps);
    assert.equal(calls, 1);
    assert.equal(response.status, role === "owner" ? 200 : 403);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const body = await response.json();
    if (role !== "owner") {
      assert.deepEqual(body, { allowed: false });
      return;
    }
    assert.equal(body.preview, true);
    assert.equal(body.applications.length, 3);
    assert.ok(
      body.applications.every((record: { email: string }) =>
        record.email.endsWith("@example.invalid"),
      ),
    );
    user.app_metadata.ggs_pilot.membership = "suspended";
    const suspended = await runReviewPreview(request(), deps);
    assert.equal(suspended.status, 403);
    assert.deepEqual(await suspended.json(), { allowed: false });
  });
}
test("anonymous and failed provider checks never release review fixtures", async () => {
  for (const fail of [false, true]) {
    const gateway = {
      verify: async () => {
        if (fail) throw new Error("unavailable");
        return { data: { user: null }, error: null };
      },
    } as AuthGateway;
    const response = await runReviewPreview(request(), {
      config: () => config,
      gateway: () => gateway,
    });
    assert.equal(response.status, fail ? 503 : 401);
    assert.doesNotMatch(await response.text(), /DEMO-|applications/);
  }
});
