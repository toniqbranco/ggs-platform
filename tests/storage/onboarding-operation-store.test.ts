import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createFixtureOperationStore } from "../../proposals/streamer-onboarding/operation-store";
import type { OnboardingQuery } from "../../proposals/streamer-onboarding/adapter";
import type {
  FixtureOperation,
  StepKey,
} from "../../proposals/streamer-onboarding/fixture-gateway";
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
  const key: StepKey = {
    kind: "password",
    invitationId: randomUUID(),
    operationId: randomUUID(),
    expectedBindingRevision: 3,
  };
  const row: FixtureOperation = {
    ...key,
    subject: randomUUID(),
    claimId: randomUUID(),
    state: "claimed",
    evidenceId: null,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    eligible: true,
    role: "streamer",
  };
  const calls: { sql: string; values: unknown[] }[] = [];
  let result: unknown = row;
  const channel: OnboardingQuery = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ result }] };
    },
  };
  const store = createFixtureOperationStore({
    mode: "isolated-fixture",
    channel,
  });
  return {
    key,
    row,
    calls,
    channel,
    store,
    setResult(value: unknown) {
      result = value;
    },
  };
}
test("durable store rejects disabled and production runtimes before channel access", async () => {
  const f = fixture();
  assert.throws(
    () => createFixtureOperationStore({ channel: f.channel }),
    /unavailable/,
  );
  env.NODE_ENV = "production";
  try {
    await assert.rejects(f.store.claim(f.key, f.row.subject), /unavailable/);
    await assert.rejects(f.store.uncertain(f.row), /unavailable/);
  } finally {
    delete env.NODE_ENV;
  }
  assert.equal(f.calls.length, 0);
});
test("durable store parameterizes commands and generates a new private claim capability", async () => {
  const f = fixture();
  await f.store.claim(f.key, f.row.subject);
  const c = f.calls[0]!;
  assert.match(c.sql, /\$6/);
  assert.ok(!c.sql.includes(f.key.invitationId));
  assert.deepEqual(c.values.slice(0, 5), [
    "password",
    f.key.invitationId,
    f.key.operationId,
    3,
    f.row.subject,
  ]);
  assert.match(String(c.values[5]), /^[a-f0-9-]{36}$/);
  await f.store.claim(f.key, f.row.subject);
  assert.notEqual(f.calls[1]!.values[5], c.values[5]);
});
test("durable store rejects unknown fields and invitation/password actor mismatch before SQL", async () => {
  const f = fixture();
  const injected = { ...f.key, secret: "must-not-query" };
  await assert.rejects(f.store.claim(injected, f.row.subject), /invalid/);
  await assert.rejects(f.store.claim(f.key, null), /invalid/);
  await assert.rejects(
    f.store.claim({ ...f.key, kind: "invitation" }, f.row.subject),
    /invalid/,
  );
  await assert.rejects(f.store.read(f.key, "invalid"), /invalid/);
  await assert.rejects(
    f.store.verified({ ...f.row, claimId: null }, randomUUID()),
    /unavailable/,
  );
  assert.equal(f.calls.length, 0);
});
test("durable store sanitizes query errors and malformed results", async () => {
  for (const [code, reason] of [
    ["42501", "denied"],
    ["23505", "reconciliation-required"],
    ["P0003", "reconciliation-required"],
    ["XX000", "unavailable"],
  ]) {
    const f = fixture();
    const store = createFixtureOperationStore({
      mode: "isolated-fixture",
      channel: {
        query: async () => {
          throw { code, message: "secret database details" };
        },
      },
    });
    await assert.rejects(store.claim(f.key, f.row.subject), (error: Error) => {
      assert.ok(error.message.endsWith(String(reason)));
      assert.ok(!error.message.includes("secret"));
      return true;
    });
  }
  const f = fixture();
  f.setResult({ ...f.row, password: "must-not-return" });
  await assert.rejects(f.store.claim(f.key, f.row.subject), /unavailable/);
});
test("durable store refuses to acknowledge an unresolved proof and requires boolean cleanup result", async () => {
  const f = fixture();
  const evidence = randomUUID();
  f.setResult({ ...f.row, state: "reconcile", claimId: null });
  await assert.rejects(
    f.store.verified(f.row, evidence),
    /reconciliation-required/,
  );
  f.setResult({
    ...f.row,
    state: "verified",
    claimId: null,
    evidenceId: evidence,
  });
  await f.store.verified(f.row, evidence);
  f.setResult(false);
  await assert.rejects(f.store.uncertain(f.row), /unavailable/);
  f.setResult(true);
  await f.store.uncertain(f.row);
  assert.equal(f.calls.at(-1)!.values.length, 2);
});
