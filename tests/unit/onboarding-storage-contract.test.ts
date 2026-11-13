import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
import type { OnboardingContext } from "../../src/lib/pilot/onboarding";
import {
  reviewInviteIntent,
  reviewProfileWrite,
  profileFieldsSchema,
  fingerprintIntent,
  classifyReceipt,
  receiptSchema,
  projectAuditEvent,
  auditEventSchema,
} from "../../proposals/streamer-onboarding/contract";

const applicationId = "00000000-0000-4000-8000-000000000010";
const bindingId = "00000000-0000-4000-8000-000000000011";
const operationId = "00000000-0000-4000-8000-000000000012";
const subject = "00000000-0000-4000-8000-000000000002";
const intent = { operationId, applicationId, expectedApplicationRevision: 2 };
const application = {
  id: applicationId,
  revision: 2,
  state: "approved",
  decidedBy: fixtureOwnerId,
};
const owner = () => ({
  ownerId: fixtureOwnerId,
  verifiedOwner: approvedFixtureUser("owner"),
  application,
});
const onboarding: OnboardingContext = {
  ownerId: fixtureOwnerId,
  identity: { subject, session: "valid", emailVerified: true },
  record: {
    version: 1,
    subject,
    approvedBy: fixtureOwnerId,
    applicationId,
    applicationRevision: 2,
    invitationId: bindingId,
    approval: "approved",
    invitation: "accepted",
    membership: "pending",
    role: "streamer",
    password: "complete",
    profile: "pending",
  },
};
const profile = {
  operationId,
  invitationId: bindingId,
  expectedBindingRevision: 3,
  expectedProfileRevision: 0,
  displayName: "Stream Talents Demo Creator",
  country: "Colombia",
  platform: "twitch",
  profileUrl: "https://example.invalid/creator",
  locale: "es",
};
const profileContext = () => ({
  onboarding: structuredClone(onboarding),
  bindingRevision: 3,
  profileRevision: 0,
});
const expected = {
  operationId,
  actorId: subject,
  subject,
  bindingId,
  purpose: "profile",
  requestHash: fingerprintIntent("profile", profile),
};
const receipt = {
  ...expected,
  version: 1,
  state: "committed",
  resultRevision: 1,
  resolvedSubject: subject,
};

test("current owner can reserve an invite intent without creating account or admission", () => {
  assert.deepEqual(reviewInviteIntent(intent, owner()), {
    allowed: true,
    value: intent,
  });
  assert.equal(application.state, "approved");
});
for (const role of ["admin", "streamer"] as const)
  test(`${role} cannot reserve invitations`, () => {
    assert.equal(
      reviewInviteIntent(intent, {
        ...owner(),
        verifiedOwner: approvedFixtureUser(role),
      }).allowed,
      false,
    );
  });
test("missing or newly suspended owner cannot reserve an invitation", () => {
  assert.equal(
    reviewInviteIntent(intent, { ...owner(), verifiedOwner: null }).allowed,
    false,
  );
  const context = owner();
  context.verifiedOwner.app_metadata.ggs_pilot.membership = "suspended";
  assert.equal(reviewInviteIntent(intent, context).allowed, false);
});
for (const state of ["pending", "rejected", "withdrawn"])
  test(`${state} application cannot become an invitation`, () => {
    assert.equal(
      reviewInviteIntent(intent, {
        ...owner(),
        application: { ...application, state },
      }).allowed,
      false,
    );
  });
test("copied application, stale revision and wrong approving actor fail closed", () => {
  assert.deepEqual(
    reviewInviteIntent({ ...intent, expectedApplicationRevision: 1 }, owner()),
    { allowed: false, reason: "conflict" },
  );
  assert.equal(
    reviewInviteIntent(intent, {
      ...owner(),
      application: { ...application, id: operationId },
    }).allowed,
    false,
  );
  assert.equal(
    reviewInviteIntent(intent, {
      ...owner(),
      application: { ...application, decidedBy: subject },
    }).allowed,
    false,
  );
});
test("browser subject, contact, role and metadata fields cannot select an invited identity", () => {
  for (const field of [
    "subject",
    "email",
    "role",
    "app_metadata",
    "user_metadata",
  ])
    assert.deepEqual(
      reviewInviteIntent({ ...intent, [field]: "forged" }, owner()),
      { allowed: false, reason: "invalid" },
    );
});
test("own profile command validates without changing membership or progress", () => {
  const context = profileContext();
  assert.equal(reviewProfileWrite(profile, context).allowed, true);
  assert.equal(context.onboarding.record.profile, "pending");
  assert.equal(context.onboarding.record.membership, "pending");
});
test("profile writes reject another subject, revoked invitation and suspended membership", () => {
  for (const change of [
    { subject: operationId },
    { invitation: "revoked" },
    { membership: "suspended" },
  ]) {
    const context = profileContext();
    Object.assign(context.onboarding.record, change);
    assert.equal(reviewProfileWrite(profile, context).allowed, false);
  }
});
test("profile writes require completed password and pending profile step", () => {
  for (const change of [
    { password: "pending" },
    { profile: "complete" },
    { membership: "active" },
  ]) {
    const context = profileContext();
    Object.assign(context.onboarding.record, change);
    assert.equal(reviewProfileWrite(profile, context).allowed, false);
  }
});
test("profile updates compare both binding and profile revisions and invitation identity", () => {
  for (const change of [
    { expectedBindingRevision: 2 },
    { expectedProfileRevision: 1 },
    { invitationId: operationId },
  ])
    assert.deepEqual(
      reviewProfileWrite({ ...profile, ...change }, profileContext()),
      { allowed: false, reason: "conflict" },
    );
});
test("profiles reject credentials, contact duplication, roles and unsafe URLs", () => {
  for (const field of [
    "password",
    "email",
    "phone",
    "subject",
    "roles",
    "membership",
    "passwordSet",
  ])
    assert.equal(
      reviewProfileWrite({ ...profile, [field]: "forged" }, profileContext())
        .allowed,
      false,
    );
  for (const profileUrl of [
    "javascript:alert(1)",
    "http://example.invalid",
    "https://name:secret@example.invalid",
  ])
    assert.equal(
      reviewProfileWrite({ ...profile, profileUrl }, profileContext()).allowed,
      false,
    );
  assert.equal(
    profileFieldsSchema.safeParse({
      displayName: "X",
      country: "CO",
      platform: "other",
      profileUrl: "https://example.invalid",
      locale: "fr",
    }).success,
    false,
  );
});
test("fingerprints normalize profile whitespace and input key order but bind changed values", () => {
  const reordered = Object.fromEntries(Object.entries(profile).reverse());
  assert.equal(fingerprintIntent("profile", reordered), expected.requestHash);
  assert.equal(
    fingerprintIntent("profile", {
      ...profile,
      displayName: " Stream Talents Demo Creator ",
    }),
    expected.requestHash,
  );
  assert.notEqual(
    fingerprintIntent("profile", {
      ...profile,
      displayName: "Another Creator",
    }),
    expected.requestHash,
  );
  assert.throws(
    () =>
      fingerprintIntent("profile", { ...profile, password: "DO-NOT-STORE" }),
    { message: "Invalid onboarding intent" },
  );
});
test("committed exact retries are receipts; uncertain provider outcomes require reconciliation", () => {
  assert.equal(classifyReceipt(expected, null), "new");
  assert.equal(classifyReceipt(expected, receipt), "replay");
  for (const state of ["in-flight", "reconcile"])
    assert.equal(
      classifyReceipt(expected, {
        ...receipt,
        state,
        resultRevision: null,
        resolvedSubject: null,
      }),
      "reconcile",
    );
  assert.equal(
    classifyReceipt(expected, {
      ...receipt,
      state: "reserved",
      resultRevision: null,
      resolvedSubject: null,
    }),
    "reserved",
  );
  assert.equal(
    classifyReceipt(expected, {
      ...receipt,
      state: "rejected",
      resultRevision: null,
      resolvedSubject: null,
    }),
    "blocked",
  );
});
test("cross-account, cross-purpose and changed-payload receipts cannot be replayed", () => {
  for (const change of [
    {
      actorId: operationId,
      subject: operationId,
      resolvedSubject: operationId,
    },
    { bindingId: operationId },
    { purpose: "invite", subject: null },
    { operationId: bindingId },
    { requestHash: "0".repeat(64) },
  ])
    assert.equal(
      classifyReceipt(expected, { ...receipt, ...change }),
      "conflict",
    );
});
test("malformed receipts and impossible commit results never count as success", () => {
  for (const change of [
    { resultRevision: null },
    { state: "in-flight" },
    { password: "DO-NOT-STORE" },
    { version: 2 },
  ])
    assert.equal(
      receiptSchema.safeParse({ ...receipt, ...change }).success,
      false,
    );
  assert.equal(classifyReceipt(expected, undefined), "invalid");
  assert.equal(
    classifyReceipt({ ...expected, subject: "bad" }, null),
    "invalid",
  );
});
test("invitation reservation precedes provider identity; committed result binds the resolved account", () => {
  const inviteIdentity = {
    ...expected,
    actorId: fixtureOwnerId,
    subject: null,
    purpose: "invite",
    requestHash: fingerprintIntent("invite", intent),
  };
  assert.equal(
    classifyReceipt(inviteIdentity, {
      ...inviteIdentity,
      version: 1,
      state: "reserved",
      resultRevision: null,
      resolvedSubject: null,
    }),
    "reserved",
  );
  assert.equal(
    classifyReceipt(inviteIdentity, {
      ...inviteIdentity,
      version: 1,
      state: "committed",
      resultRevision: 1,
      resolvedSubject: subject,
    }),
    "replay",
  );
  assert.equal(
    classifyReceipt(inviteIdentity, {
      ...inviteIdentity,
      version: 1,
      state: "committed",
      resultRevision: 1,
      resolvedSubject: null,
    }),
    "invalid",
  );
});
test("audit projection excludes profile values, credentials and request fingerprints", () => {
  const event = {
    version: 1 as const,
    operationId,
    bindingId,
    actorId: subject,
    subject,
    revision: 1,
    kind: "profile-saved" as const,
    occurredAt: "2026-11-02T00:00:00Z",
  };
  const extras = {
    ...event,
    email: "fictional@example.invalid",
    password: "DO-NOT-STORE",
    token: "DO-NOT-STORE",
    profile,
    requestHash: expected.requestHash,
  };
  assert.deepEqual(projectAuditEvent(extras), event);
  assert.equal(auditEventSchema.safeParse(extras).success, false);
  assert.equal(
    JSON.stringify(projectAuditEvent(extras)).includes("DO-NOT-STORE"),
    false,
  );
});
