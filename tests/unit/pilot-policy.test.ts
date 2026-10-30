import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePilotPolicy } from "../../src/lib/pilot/policy";
import { pilotIdentities } from "../fixtures/pilot-identities";

for (const [role, expected] of [
  ["owner", [true, false, true]],
  ["hq", [true, false, false]],
  ["streamer", [false, true, false]],
] as const) {
  test(`active invited ${role} follows the explicit workspace/management matrix`, () => {
    const decisions = ["hq", "streamer", "pilot-management"].map(
      (target) => evaluatePilotPolicy(target, pilotIdentities[role]).allowed,
    );
    assert.deepEqual(decisions, [...expected]);
  });
}

test("visitors receive no role-specific decision before sign-in", () => {
  assert.deepEqual(evaluatePilotPolicy("hq", pilotIdentities.visitor), {
    allowed: false,
    reason: "sign-in-required",
  });
});

for (const scenario of [
  {
    name: "expired session",
    change: { session: "expired" },
    reason: "session-expired",
  },
  {
    name: "no invitation",
    change: { invitation: "not-invited" },
    reason: "invitation-required",
  },
  {
    name: "unaccepted invitation",
    change: { invitation: "pending" },
    reason: "invitation-required",
  },
  {
    name: "expired invitation",
    change: { invitation: "expired" },
    reason: "invitation-inactive",
  },
  {
    name: "revoked invitation",
    change: { invitation: "revoked" },
    reason: "invitation-inactive",
  },
  {
    name: "pending membership",
    change: { membership: "pending" },
    reason: "membership-pending",
  },
  {
    name: "suspended membership",
    change: { membership: "suspended" },
    reason: "membership-suspended",
  },
  { name: "no assigned role", change: { roles: [] }, reason: "role-denied" },
]) {
  test(`${scenario.name} blocks even an owner`, () => {
    assert.deepEqual(
      evaluatePilotPolicy("pilot-management", {
        ...pilotIdentities.owner,
        ...scenario.change,
      }),
      { allowed: false, reason: scenario.reason },
    );
  });
}

test("an explicit secondary role grants its area but HQ staff cannot manage pilot access", () => {
  const multiRole = { ...pilotIdentities.hq, roles: ["hq_staff", "streamer"] };
  assert.equal(evaluatePilotPolicy("hq", multiRole).allowed, true);
  assert.equal(evaluatePilotPolicy("streamer", multiRole).allowed, true);
  assert.deepEqual(evaluatePilotPolicy("pilot-management", multiRole), {
    allowed: false,
    reason: "role-denied",
  });
});

for (const [name, input] of [
  ["missing context", undefined],
  ["null", null],
  ["empty context", {}],
  ["unknown role", { ...pilotIdentities.owner, roles: ["admin"] }],
  ["unknown session", { ...pilotIdentities.owner, session: "trusted" }],
  ["unexpected admin flag", { ...pilotIdentities.owner, isAdmin: true }],
  [
    "client profile metadata",
    { ...pilotIdentities.owner, user_metadata: { role: "owner" } },
  ],
]) {
  test(`malformed context fails closed: ${name}`, () => {
    assert.deepEqual(evaluatePilotPolicy("hq", input), {
      allowed: false,
      reason: "invalid-context",
    });
  });
}

for (const target of ["admin", "constructor", "__proto__", null, undefined]) {
  test(`unknown target ${String(target)} fails closed`, () => {
    assert.deepEqual(evaluatePilotPolicy(target, pilotIdentities.owner), {
      allowed: false,
      reason: "invalid-context",
    });
  });
}
