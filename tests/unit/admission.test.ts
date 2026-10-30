import assert from "node:assert/strict";
import test from "node:test";
import {
  readPilotAdmission,
  hasPilotAdmission,
} from "../../src/lib/pilot/admission";
import { evaluatePilotPolicy } from "../../src/lib/pilot/policy";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";

for (const [role, expected] of [
  ["owner", [true, false, true]],
  ["admin", [true, false, false]],
  ["streamer", [false, true, false]],
] as const) {
  test(`fresh ${role} approval binds to identity and preserves the access matrix`, () => {
    const context = readPilotAdmission(
      approvedFixtureUser(role),
      fixtureOwnerId,
    );
    assert.ok(hasPilotAdmission(context));
    assert.deepEqual(
      ["hq", "streamer", "pilot-management"].map(
        (target) => evaluatePilotPolicy(target, context).allowed,
      ),
      [...expected],
    );
  });
}
for (const [name, change] of [
  ["pending", { approval: "pending" }],
  ["rejected", { approval: "rejected" }],
  ["unaccepted invitation", { invitation: "pending" }],
  ["expired invitation", { invitation: "expired" }],
  ["revoked invitation", { invitation: "revoked" }],
  ["suspended", { membership: "suspended" }],
  ["pending membership", { membership: "pending" }],
  ["no role", { roles: [] }],
  ["unknown role", { roles: ["superadmin"] }],
  ["wrong subject", { subject: fixtureOwnerId }],
  [
    "not owner-approved",
    { approved_by: "00000000-0000-4000-8000-000000000099" },
  ],
  ["future approval", { approved_at: "2999-01-01T00:00:00Z" }],
  ["unsupported version", { version: 2 }],
  ["extra flag", { isAdmin: true }],
] as const) {
  test(`${name} never admits the user`, () => {
    const user = approvedFixtureUser();
    user.app_metadata.ggs_pilot = {
      ...user.app_metadata.ggs_pilot,
      ...change,
    } as typeof user.app_metadata.ggs_pilot;
    assert.equal(
      hasPilotAdmission(readPilotAdmission(user, fixtureOwnerId)),
      false,
    );
  });
}
test("missing owner bootstrap, record, or verified email denies entry", () => {
  const user = approvedFixtureUser();
  assert.equal(readPilotAdmission(user, undefined), null);
  assert.equal(
    readPilotAdmission({ ...user, app_metadata: {} }, fixtureOwnerId),
    null,
  );
  assert.equal(
    readPilotAdmission(
      { ...user, email_confirmed_at: undefined },
      fixtureOwnerId,
    ),
    null,
  );
  assert.equal(
    readPilotAdmission({ ...user, is_anonymous: true }, fixtureOwnerId),
    null,
  );
});
test("user-editable profile metadata can never replace server approval", () => {
  const user = approvedFixtureUser();
  const forged = {
    ...user,
    app_metadata: {},
    user_metadata: user.app_metadata,
  };
  assert.equal(readPilotAdmission(forged, fixtureOwnerId), null);
});
test("an owner role on any other identity is rejected", () => {
  const user = approvedFixtureUser();
  const forged = {
    ...user,
    app_metadata: {
      ggs_pilot: { ...user.app_metadata.ggs_pilot, roles: ["owner"] },
    },
  };
  assert.equal(readPilotAdmission(forged, fixtureOwnerId), null);
});
