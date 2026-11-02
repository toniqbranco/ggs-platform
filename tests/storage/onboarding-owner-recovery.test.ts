import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createOwnerRecoveryAdapter,
  RecoveryError,
  type RecoveryOperation,
  type RecoveryInspection,
} from "../../proposals/streamer-onboarding/owner-recovery";
import type { OnboardingQuery } from "../../proposals/streamer-onboarding/adapter";
import type { VerifiedPilotUser } from "../../src/lib/pilot/admission";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
const env = process.env as Record<string, string | undefined>;
const prior = { app: env.APP_ENV, node: env.NODE_ENV };
before(() => {
  env.APP_ENV = "test";
  delete env.NODE_ENV;
});
after(() => {
  if (prior.app === undefined) delete env.APP_ENV;
  else env.APP_ENV = prior.app;
  if (prior.node === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = prior.node;
});
function fixture() {
  const operation: RecoveryOperation = {
    operationId: randomUUID(),
    invitationId: randomUUID(),
    subject: randomUUID(),
    kind: "password",
    expectedBindingRevision: 3,
    version: 2,
    state: "reconcile",
    leaseUntil: new Date(Date.now() - 60000).toISOString(),
    reviewId: null,
    decision: null,
    resolvedBy: null,
    evidenceId: null,
  };
  const command = {
    operationId: operation.operationId,
    expectedVersion: 2,
    decision: "no-effect" as "no-effect" | "verified",
    reviewId: randomUUID(),
  };
  const state = {
    user: approvedFixtureUser("owner") as VerifiedPilotUser | null,
    verifyCalls: 0,
    inspections: 0,
    writeCalls: 0,
    calls: [] as { sql: string; values: unknown[] }[],
    evidencePatch: {} as Record<string, unknown>,
    afterInspection: undefined as (() => void) | undefined,
    failWrite: false,
    failPrepare: false,
    malformed: false,
  };
  const channel: OnboardingQuery = {
    query: async (sql, values) => {
      state.calls.push({ sql, values });
      if (sql.includes("prepare_provider_review")) {
        if (state.failPrepare) throw new Error("secret SQL failure");
        return {
          rows: [
            {
              result: state.malformed
                ? { ...operation, claimId: randomUUID() }
                : { ...operation },
            },
          ],
        };
      }
      assert.match(sql, /resolve_provider_step/);
      state.writeCalls++;
      operation.state = values[3] === "verified" ? "verified" : "abandoned";
      operation.version = 3;
      operation.reviewId = String(values[4]);
      operation.decision = values[3] as "verified" | "no-effect";
      operation.resolvedBy = String(values[0]);
      operation.evidenceId = values[5] as string | null;
      if (state.failWrite) throw new Error("secret acknowledgement failure");
      return { rows: [{ result: 3 }] };
    },
  };
  const deps = {
    mode: "isolated-fixture" as const,
    ownerUserId: fixtureOwnerId,
    operator: channel,
    verify: async () => {
      state.verifyCalls++;
      return { data: { user: state.user }, error: null };
    },
    inspectProvider: async (request: RecoveryInspection) => {
      state.inspections++;
      state.afterInspection?.();
      return {
        ...request,
        confirmed: true,
        workerStopped: true,
        providerSettled: true,
        observedAt: new Date().toISOString(),
        evidenceId: request.decision === "verified" ? randomUUID() : null,
        ...state.evidencePatch,
      };
    },
  };
  return {
    operation,
    command,
    state,
    deps,
    adapter: createOwnerRecoveryAdapter(deps),
  };
}
const reason = (expected: string) => (error: Error) =>
  error instanceof RecoveryError && error.reason === expected;
test("owner recovery is disabled by default and rejects runtime changes before any dependency", async () => {
  const f = fixture();
  const { mode, ...disabled } = f.deps;
  assert.equal(mode, "isolated-fixture");
  assert.throws(() => createOwnerRecoveryAdapter(disabled), /unavailable/);
  env.NODE_ENV = "production";
  try {
    await assert.rejects(
      f.adapter.prepare({ operationId: f.operation.operationId }),
      reason("unavailable"),
    );
    await assert.rejects(f.adapter.resolve(f.command), reason("unavailable"));
  } finally {
    delete env.NODE_ENV;
  }
  assert.equal(f.state.calls.length, 0);
  assert.equal(f.state.verifyCalls, 0);
});
test("only a fresh confirmed active configured owner may prepare recovery", async () => {
  const users: (VerifiedPilotUser | null)[] = [
    null,
    approvedFixtureUser("admin"),
    approvedFixtureUser("streamer"),
    { ...approvedFixtureUser("owner"), is_anonymous: true },
    { ...approvedFixtureUser("owner"), email_confirmed_at: "invalid" },
    {
      ...approvedFixtureUser("owner"),
      email_confirmed_at: "2099-01-01T00:00:00Z",
    },
    { ...approvedFixtureUser("owner"), app_metadata: {} },
  ];
  const suspended = approvedFixtureUser("owner");
  suspended.app_metadata.ggs_pilot.membership = "suspended";
  users.push(suspended);
  const rejected = approvedFixtureUser("owner");
  rejected.app_metadata.ggs_pilot.approval = "rejected";
  users.push(rejected);
  for (const user of users) {
    const f = fixture();
    f.state.user = user;
    await assert.rejects(
      f.adapter.prepare({ operationId: f.operation.operationId }),
      reason("denied"),
    );
    assert.equal(f.state.calls.length, 0);
  }
});
test("owner and evidence fields cannot be supplied in the recovery command", async () => {
  for (const field of [
    "actor",
    "ownerId",
    "evidenceId",
    "workerStopped",
    "providerSettled",
    "subject",
    "claimId",
  ]) {
    const f = fixture();
    await assert.rejects(
      f.adapter.resolve({ ...f.command, [field]: fixtureOwnerId }),
      reason("invalid"),
    );
    assert.equal(f.state.calls.length, 0);
  }
});
test("recovery command version and IDs are bounded and strict", async () => {
  for (const patch of [
    { expectedVersion: 0 },
    { expectedVersion: 2147483647 },
    { expectedVersion: 1.5 },
    { operationId: "invalid" },
    { decision: "reset" },
    { reviewId: "invalid" },
  ]) {
    const f = fixture();
    await assert.rejects(
      f.adapter.resolve({ ...f.command, ...patch }),
      reason("invalid"),
    );
    assert.equal(f.state.verifyCalls, 0);
  }
});
test("fresh owner and exact scoped provider evidence precede parameterized recovery SQL", async () => {
  const f = fixture();
  const result = await f.adapter.resolve(f.command);
  assert.deepEqual(result, { revision: 3, receipt: false });
  assert.equal(f.state.verifyCalls, 2);
  assert.equal(f.state.inspections, 1);
  assert.deepEqual(f.state.calls.at(-1)!.values, [
    fixtureOwnerId,
    f.operation.operationId,
    2,
    "no-effect",
    f.command.reviewId,
    null,
  ]);
  assert.equal(
    f.state.calls.filter((c) => c.sql.includes("prepare_provider_review"))
      .length,
    2,
  );
  assert.ok(
    f.state.calls.every((c) => !c.sql.includes(f.operation.operationId)),
  );
});
test("verified recovery requires provider-generated evidence and returns only a decision receipt", async () => {
  const f = fixture();
  f.command.decision = "verified";
  const result = await f.adapter.resolve(f.command);
  assert.deepEqual(Object.keys(result), ["revision", "receipt"]);
  assert.match(String(f.state.calls.at(-1)!.values[5]), /^[a-f0-9-]{36}$/);
});
test("timeouts, running workers, unsettled effects and unknown provider state cannot unlock recovery", async () => {
  for (const patch of [
    { confirmed: false },
    { workerStopped: false },
    { providerSettled: false },
    { outcome: "unknown" },
    { evidenceId: randomUUID() },
  ]) {
    const f = fixture();
    f.state.evidencePatch = patch;
    await assert.rejects(f.adapter.resolve(f.command), reason("denied"));
    assert.equal(f.state.writeCalls, 0);
  }
});
test("evidence for another owner, operation, subject, step, review or version is denied", async () => {
  for (const field of [
    "operationId",
    "invitationId",
    "subject",
    "ownerId",
    "reviewId",
    "kind",
    "expectedBindingRevision",
    "version",
    "decision",
  ]) {
    const f = fixture();
    f.state.evidencePatch = {
      [field]:
        field === "version" || field === "expectedBindingRevision"
          ? 99
          : field === "kind"
            ? "invitation"
            : field === "decision"
              ? "verified"
              : randomUUID(),
    };
    await assert.rejects(f.adapter.resolve(f.command), reason("denied"));
    assert.equal(f.state.writeCalls, 0);
  }
});
test("old and future observations and provider secrets in receipts are rejected", async () => {
  for (const patch of [
    { observedAt: new Date(Date.now() - 61000).toISOString() },
    { observedAt: "2099-01-01T00:00:00Z" },
    { password: "must-not-save" },
    { tokenHash: "must-not-save" },
  ]) {
    const f = fixture();
    f.state.evidencePatch = patch;
    await assert.rejects(f.adapter.resolve(f.command), reason("denied"));
    assert.equal(f.state.writeCalls, 0);
  }
});
test("owner revocation after inspection stops the write even when provider evidence is valid", async () => {
  const f = fixture();
  f.state.afterInspection = () => {
    f.state.user = null;
  };
  await assert.rejects(f.adapter.resolve(f.command), reason("denied"));
  assert.equal(f.state.writeCalls, 0);
});
test("operation version drift after inspection stops a stale owner decision", async () => {
  const f = fixture();
  f.state.afterInspection = () => {
    f.operation.version++;
  };
  await assert.rejects(f.adapter.resolve(f.command), reason("conflict"));
  assert.equal(f.state.writeCalls, 0);
});
test("unexpired active claims and stale expected versions cannot trigger provider inspection", async () => {
  const f = fixture();
  f.operation.state = "claimed";
  await assert.rejects(f.adapter.resolve(f.command), reason("conflict"));
  f.operation.state = "reconcile";
  f.operation.version = 4;
  await assert.rejects(f.adapter.resolve(f.command), reason("conflict"));
  assert.equal(f.state.inspections, 0);
});
test("lost owner decision acknowledgement requires reconciliation; exact retry reads a receipt without reinspection", async () => {
  const f = fixture();
  f.state.failWrite = true;
  await assert.rejects(
    f.adapter.resolve(f.command),
    reason("reconciliation-required"),
  );
  assert.deepEqual(await f.adapter.resolve(f.command), {
    revision: 3,
    receipt: true,
  });
  assert.equal(f.state.inspections, 1);
  assert.equal(f.state.writeCalls, 1);
  await assert.rejects(
    f.adapter.resolve({ ...f.command, reviewId: randomUUID() }),
    reason("conflict"),
  );
});
test("provider, identity and database failures are sanitized and never retried automatically", async () => {
  const f = fixture();
  f.deps.inspectProvider = async () => {
    throw new Error("secret provider error");
  };
  await assert.rejects(f.adapter.resolve(f.command), reason("unavailable"));
  assert.equal(f.state.writeCalls, 0);
  const g = fixture();
  g.state.failPrepare = true;
  await assert.rejects(
    g.adapter.resolve(g.command),
    reason("reconciliation-required"),
  );
  assert.equal(g.state.calls.length, 1);
  const h = fixture();
  h.state.malformed = true;
  await assert.rejects(h.adapter.resolve(h.command), reason("unavailable"));
  assert.equal(h.state.inspections, 0);
});

test("provider evidence cannot age out while owner identity is rechecked", async () => {
  const f = fixture();
  const original = Date.now;
  let count = 0;
  f.deps.verify = async () => {
    if (++count === 2) Date.now = () => original() + 61000;
    return { data: { user: f.state.user }, error: null };
  };
  try {
    await assert.rejects(f.adapter.resolve(f.command), reason("denied"));
    assert.equal(f.state.writeCalls, 0);
  } finally {
    Date.now = original;
  }
});
