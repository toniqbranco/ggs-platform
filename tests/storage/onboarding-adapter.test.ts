import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import {
  createOnboardingAdapter,
  createTestingOnboardingAdapter,
  OnboardingAdapterError,
  type EvidenceRequest,
} from "../../proposals/streamer-onboarding/adapter";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";
import type { VerifiedPilotUser } from "../../src/lib/pilot/admission";

const adapterTestEnv = process.env as Record<string, string | undefined>;
const priorEnv = process.env.APP_ENV,
  priorNode = process.env.NODE_ENV;
before(() => {
  process.env.APP_ENV = "test";
  delete adapterTestEnv.NODE_ENV;
});
after(() => {
  if (priorEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = priorEnv;
  if (priorNode === undefined) delete adapterTestEnv.NODE_ENV;
  else adapterTestEnv.NODE_ENV = priorNode;
});
const invitationId = "00000000-0000-4000-8000-000000000010";
const operationId = "00000000-0000-4000-8000-000000000011";
const evidenceId = "00000000-0000-4000-8000-000000000012";
const command = { invitationId, operationId, expectedBindingRevision: 4 };
const profile = {
  ...command,
  expectedProfileRevision: 0,
  displayName: "Creator Demo",
  country: "Colombia",
  platform: "twitch",
  profileUrl: "https://example.invalid/creator",
  locale: "es",
};
let user: VerifiedPilotUser | null, verifyCalls: number, proofCalls: number;
let calls: { channel: string; sql: string; values: unknown[] }[];
let databaseError: unknown,
  providerError: unknown,
  response: Record<string, unknown>;
let proofChange: Record<string, unknown>, afterProof: (() => void) | undefined;
function factory(mode: "disabled" | "isolated-fixture" = "isolated-fixture") {
  const query = (channel: string) => ({
    query: async (sql: string, values: unknown[]) => {
      calls.push({ channel, sql, values });
      if (databaseError) throw databaseError;
      return { rows: [sql.includes("read_self") ? response : { revision: 5 }] };
    },
  });
  return createOnboardingAdapter({
    mode,
    ownerUserId: fixtureOwnerId,
    verify: async () => {
      verifyCalls++;
      if (providerError) throw providerError;
      return { data: { user }, error: null };
    },
    verifyEvidence: async (request: EvidenceRequest) => {
      proofCalls++;
      afterProof?.();
      return { ...request, evidenceId, verified: true, ...proofChange };
    },
    setup: query("setup"),
    reader: query("reader"),
  });
}
beforeEach(() => {
  process.env.APP_ENV = "test";
  delete adapterTestEnv.NODE_ENV;
  user = approvedFixtureUser("streamer");
  verifyCalls = 0;
  proofCalls = 0;
  calls = [];
  databaseError = null;
  providerError = null;
  proofChange = {};
  afterProof = undefined;
  response = {
    result: { membership: "pending", bindingRevision: 4, profile: null },
  };
});
const failure = (reason: string) => (error: unknown) =>
  error instanceof OnboardingAdapterError && error.reason === reason;

test("disabled adapter performs no verification, evidence read or SQL", async () => {
  const adapter = factory("disabled");
  for (const invoke of [
    () => adapter.readSelf({ invitationId }),
    () => adapter.saveProfile(profile),
    () => adapter.finalize(command),
    () => adapter.recordVerifiedInvitation(command),
    () => adapter.recordVerifiedPassword(command),
  ])
    await assert.rejects(invoke(), failure("unavailable"));
  assert.equal(verifyCalls, 0);
  assert.equal(proofCalls, 0);
  assert.equal(calls.length, 0);
});
test("development and production modes fail before any dependency, including after construction", async () => {
  const adapter = factory();
  process.env.APP_ENV = "development";
  await assert.rejects(
    adapter.readSelf({ invitationId }),
    failure("unavailable"),
  );
  process.env.APP_ENV = "test";
  adapterTestEnv.NODE_ENV = "production";
  await assert.rejects(adapter.saveProfile(profile), failure("unavailable"));
  assert.equal(verifyCalls, 0);
  assert.equal(calls.length, 0);
});
test("each read verifies fresh identity, and revoked provider identity stops before SQL", async () => {
  const adapter = factory();
  const result = await adapter.readSelf({ invitationId });
  assert.equal(result.workspaceAccess, false);
  user = null;
  await assert.rejects(adapter.readSelf({ invitationId }), failure("denied"));
  assert.equal(verifyCalls, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.channel, "reader");
});
test("unverified, anonymous, malformed and future-confirmed identities never reach SQL", async () => {
  for (const change of [
    { email_confirmed_at: undefined },
    { email_confirmed_at: "invalid" },
    { email_confirmed_at: "2999-01-01T00:00:00Z" },
    { is_anonymous: true },
    { id: "forged" },
  ]) {
    user = { ...approvedFixtureUser("streamer"), ...change };
    await assert.rejects(factory().saveProfile(profile), failure("denied"));
  }
  assert.equal(calls.length, 0);
});
for (const role of ["owner", "admin"] as const)
  test(`${role} login cannot silently enter new-streamer setup`, async () => {
    user = approvedFixtureUser(role);
    await assert.rejects(
      factory().readSelf({ invitationId }),
      failure("denied"),
    );
    assert.equal(calls.length, 0);
  });
test("browser actor, authority, evidence and password fields are rejected before lookup", async () => {
  for (const key of [
    "subject",
    "actor",
    "membership",
    "role",
    "evidenceId",
    "password",
  ])
    await assert.rejects(
      factory().saveProfile({ ...profile, [key]: "forged" }),
      failure("invalid"),
    );
  await assert.rejects(
    factory().recordVerifiedPassword({ ...command, evidenceId }),
    failure("invalid"),
  );
  assert.equal(verifyCalls, 0);
  assert.equal(calls.length, 0);
});
test("profile mapping uses only server identity, fixed SQL and validated normalized values", async () => {
  await factory().saveProfile({ ...profile, displayName: " Creator Demo " });
  const call = calls[0]!;
  assert.equal(call.channel, "setup");
  assert.equal(
    call.sql,
    "select ggs_onboarding.setup_transition($1,$2,$3,$4,$5,$6) revision",
  );
  assert.deepEqual(call.values.slice(0, 5), [
    approvedFixtureUser("streamer").id,
    invitationId,
    operationId,
    4,
    "profile",
  ]);
  assert.deepEqual(JSON.parse(call.values[5] as string), {
    displayName: "Creator Demo",
    country: "Colombia",
    platform: "twitch",
    profileUrl: "https://example.invalid/creator",
    locale: "es",
    expectedProfileRevision: 0,
  });
  assert.equal(proofCalls, 0);
});
for (const kind of ["invitation", "password"] as const)
  test(`${kind} evidence requires exact actor/binding/operation/step and a second fresh identity`, async () => {
    const adapter = factory();
    await (kind === "invitation"
      ? adapter.recordVerifiedInvitation(command)
      : adapter.recordVerifiedPassword(command));
    assert.equal(verifyCalls, 2);
    assert.equal(proofCalls, 1);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.values[4],
      kind === "invitation" ? "accept" : "password",
    );
    assert.deepEqual(JSON.parse(calls[0]!.values[5] as string), {
      evidence: evidenceId,
    });
  });
test("mismatched, unverified or extra evidence is not a setup receipt", async () => {
  for (const change of [
    { subject: fixtureOwnerId },
    { invitationId: operationId },
    { operationId: invitationId },
    { kind: "invitation" },
    { expectedBindingRevision: 2 },
    { verified: false },
    { token: "DO-NOT-RETURN" },
  ]) {
    proofChange = change;
    await assert.rejects(
      factory().recordVerifiedPassword(command),
      failure("denied"),
    );
  }
  assert.equal(calls.length, 0);
});
test("identity change during evidence lookup denies rather than using an earlier identity", async () => {
  afterProof = () => {
    user = { ...approvedFixtureUser("streamer"), id: invitationId };
  };
  await assert.rejects(
    factory().recordVerifiedInvitation(command),
    failure("denied"),
  );
  assert.equal(calls.length, 0);
});
test("unknown database result after verified evidence requires reconciliation without retry", async () => {
  databaseError = new Error("DO-NOT-RETURN password token personal details");
  await assert.rejects(
    factory().recordVerifiedPassword(command),
    failure("reconciliation-required"),
  );
  assert.equal(proofCalls, 1);
  assert.equal(calls.length, 1);
});
test("provider exceptions and SQL errors reveal only controlled failure classes", async () => {
  providerError = new Error("DO-NOT-RETURN bearer secret");
  await assert.rejects(factory().readSelf({ invitationId }), {
    message: "Onboarding adapter: unavailable",
  });
  assert.equal(calls.length, 0);
  providerError = null;
  for (const [code, reason] of [
    ["42501", "denied"],
    ["P0003", "conflict"],
    ["23505", "conflict"],
    ["23514", "invalid"],
    ["XX000", "unavailable"],
  ]) {
    databaseError = { code, message: "DO-NOT-RETURN" };
    await assert.rejects(factory().saveProfile(profile), failure(reason!));
  }
});
test("unexpected private fields or invalid profile output fail closed without returning data", async () => {
  for (const result of [
    {
      membership: "active",
      bindingRevision: 6,
      profile: null,
      password: "DO-NOT-RETURN",
    },
    {
      membership: "active",
      bindingRevision: 6,
      profile: {
        displayName: "Creator",
        country: "Colombia",
        platform: "twitch",
        profileUrl: "javascript:alert(1)",
        locale: "es",
        revision: 1,
      },
    },
    { membership: "suspended", bindingRevision: 6, profile: null },
  ]) {
    response = { result };
    await assert.rejects(
      factory().readSelf({ invitationId }),
      failure("unavailable"),
    );
  }
});
test("finalization is a fixed separate SQL command and returns no workspace permission", async () => {
  assert.deepEqual(await factory().finalize(command), { revision: 5 });
  assert.equal(calls[0]!.values[4], "finalize");
  assert.equal(calls[0]!.values[5], "{}");
  assert.equal(proofCalls, 0);
});

function testingFixture() {
  const subject = approvedFixtureUser("streamer").id;
  const scope = {
    subject,
    invitationId,
    applicationId: "00000000-0000-4000-8000-000000000013",
    applicationRevision: 2,
  };
  const state = {
    user: approvedFixtureUser("streamer"),
    binding: { ...scope, approval: "approved", decidedBy: fixtureOwnerId },
    onProof: () => {},
    checks: 0,
    writes: 0,
  };
  const deps = {
    enabled: true,
    providerOrigin: "https://rchxnmpsxfbsicthasxn.supabase.co",
    appOrigin: "http://127.0.0.1:3103",
    ownerUserId: fixtureOwnerId,
    scope,
    verify: async () => ({ data: { user: state.user }, error: null }),
    readApprovedBinding: async () => {
      state.checks++;
      return state.binding;
    },
    verifyEvidence: async (request: EvidenceRequest) => {
      state.onProof();
      return { ...request, evidenceId, verified: true };
    },
    setup: {
      query: async () => {
        state.writes++;
        return { rows: [{ revision: 5 }] };
      },
    },
    reader: {
      query: async () => ({
        rows: [
          {
            result: {
              membership: "pending",
              bindingRevision: 4,
              profile: null,
            },
          },
        ],
      }),
    },
  };
  return { state, deps };
}

test("testing adapter requires explicit enablement and exact project and app origins", async () => {
  const { deps, state } = testingFixture();
  for (const patch of [
    { enabled: false },
    { providerOrigin: "https://wrong-project.supabase.co" },
    { appOrigin: "https://example.invalid" },
  ]) {
    await assert.rejects(
      createTestingOnboardingAdapter({ ...deps, ...patch }).finalize(command),
      failure("unavailable"),
    );
  }
  adapterTestEnv.NODE_ENV = "production";
  await assert.rejects(
    createTestingOnboardingAdapter(deps).finalize(command),
    failure("unavailable"),
  );
  assert.equal(state.checks, 0);
  assert.equal(state.writes, 0);
});

test("testing adapter denies another invitation, subject, or approval revision", async () => {
  const { deps, state } = testingFixture();
  const adapter = createTestingOnboardingAdapter(deps);
  await assert.rejects(
    adapter.finalize({ ...command, invitationId: operationId }),
    failure("denied"),
  );
  state.user = { ...state.user, id: operationId };
  await assert.rejects(adapter.finalize(command), failure("denied"));
  assert.equal(state.checks, 0);
  state.user = approvedFixtureUser("streamer");
  state.binding.applicationRevision++;
  await assert.rejects(adapter.finalize(command), failure("denied"));
  assert.equal(state.writes, 0);
});

test("testing adapter rechecks the approved binding after provider evidence", async () => {
  const { deps, state } = testingFixture();
  const adapter = createTestingOnboardingAdapter(deps);
  assert.deepEqual(await adapter.recordVerifiedPassword(command), {
    revision: 5,
  });
  assert.equal(state.checks, 2);
  state.onProof = () => {
    state.binding.approval = "withdrawn";
  };
  await assert.rejects(
    adapter.recordVerifiedPassword(command),
    failure("denied"),
  );
  assert.equal(state.writes, 1);
});
