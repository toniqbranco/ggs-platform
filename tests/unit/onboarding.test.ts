import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateOnboarding,
  type OnboardingContext,
} from "../../src/lib/pilot/onboarding";
import { readSetupStep } from "../../src/lib/i18n/setup";

const fixture: OnboardingContext = {
  ownerId: "00000000-0000-4000-8000-000000000001",
  identity: {
    subject: "00000000-0000-4000-8000-000000000002",
    session: "valid",
    emailVerified: true,
  },
  record: {
    version: 1,
    subject: "00000000-0000-4000-8000-000000000002",
    approvedBy: "00000000-0000-4000-8000-000000000001",
    applicationId: "00000000-0000-4000-8000-000000000003",
    applicationRevision: 2,
    invitationId: "00000000-0000-4000-8000-000000000004",
    approval: "approved",
    invitation: "accepted",
    membership: "pending",
    role: "streamer",
    password: "pending",
    profile: "pending",
  },
};
const actions = ["password", "profile", "finalize", "streamer"];
function decisions(context: unknown) {
  return actions.map((action) => evaluateOnboarding(action, context).allowed);
}

test("verified invited streamer can set password without workspace access", () => {
  assert.deepEqual(decisions(fixture), [true, false, false, false]);
});
test("server password receipt opens only profile step", () => {
  assert.deepEqual(
    decisions({
      ...fixture,
      record: { ...fixture.record, password: "complete" },
    }),
    [false, true, false, false],
  );
});
test("completed profile needs server finalization, not a workspace grant", () => {
  assert.deepEqual(
    decisions({
      ...fixture,
      record: { ...fixture.record, password: "complete", profile: "complete" },
    }),
    [false, false, true, false],
  );
});
test("active complete streamer has no first-setup mutation authority", () => {
  assert.deepEqual(
    decisions({
      ...fixture,
      record: {
        ...fixture.record,
        password: "complete",
        profile: "complete",
        membership: "active",
      },
    }),
    [false, false, false, true],
  );
});
for (const [key, value] of [
  ["approval", "pending"],
  ["approval", "rejected"],
  ["invitation", "pending"],
  ["invitation", "expired"],
  ["invitation", "revoked"],
  ["membership", "suspended"],
  ["role", "owner"],
  ["role", "admin"],
  ["version", 2],
  ["subject", "00000000-0000-4000-8000-000000000099"],
  ["approvedBy", "00000000-0000-4000-8000-000000000099"],
] as const) {
  test(`setup and workspace deny ${key}=${value}`, () => {
    assert.deepEqual(
      decisions({ ...fixture, record: { ...fixture.record, [key]: value } }),
      [false, false, false, false],
    );
  });
}
for (const session of ["absent", "expired"] as const) {
  test(`${session} session has no setup or streamer permission`, () => {
    assert.deepEqual(
      decisions({ ...fixture, identity: { ...fixture.identity, session } }),
      [false, false, false, false],
    );
  });
}
test("unverified email cannot set up even with an approved record", () => {
  assert.deepEqual(
    decisions({
      ...fixture,
      identity: { ...fixture.identity, emailVerified: false },
    }),
    [false, false, false, false],
  );
});
test("editable flags, extra fields and unknown targets cannot promote access", () => {
  assert.deepEqual(decisions({ ...fixture, passwordSet: true }), [
    false,
    false,
    false,
    false,
  ]);
  assert.equal(evaluateOnboarding("hq", fixture).allowed, false);
  assert.deepEqual(decisions(null), [false, false, false, false]);
});
test("profile completion without password receipt does not skip setup", () => {
  assert.deepEqual(
    decisions({
      ...fixture,
      record: { ...fixture.record, profile: "complete" },
    }),
    [false, false, false, false],
  );
});
test("a fresh suspended record denies previously complete streamer access", () => {
  const active = {
    ...fixture,
    record: {
      ...fixture.record,
      password: "complete",
      profile: "complete",
      membership: "active",
    },
  };
  assert.equal(evaluateOnboarding("streamer", active).allowed, true);
  assert.equal(
    evaluateOnboarding("streamer", {
      ...active,
      record: { ...active.record, membership: "suspended" },
    }).allowed,
    false,
  );
});
test("preview query selects only a display step and rejects arrays/unknown states", () => {
  assert.equal(readSetupStep("profile"), "profile");
  for (const value of [
    undefined,
    "complete",
    "https://example.invalid",
    ["profile"],
    { role: "owner" },
  ])
    assert.equal(readSetupStep(value), "password");
});
