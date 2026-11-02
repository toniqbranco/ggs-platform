import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
import { postgres17TestConfig } from "./config";
import {
  createOnboardingAdapter,
  OnboardingAdapterError,
  type OnboardingQuery,
} from "../../proposals/streamer-onboarding/adapter";
import type { VerifiedPilotUser } from "../../src/lib/pilot/admission";
import { setupWireFixture, setupHttpClient } from "../fixtures/onboarding-wire";
import { createFixtureOperationStore } from "../../proposals/streamer-onboarding/operation-store";
import {
  createOwnerRecoveryAdapter,
  RecoveryError,
} from "../../proposals/streamer-onboarding/owner-recovery";
import { approvedFixtureUser } from "../fixtures/pilot-admissions";
import type {
  FixtureOperation,
  StepKey,
} from "../../proposals/streamer-onboarding/fixture-gateway";

const config = postgres17TestConfig(process.env);
const suffix = randomBytes(6).toString("hex");
const database = `ggs_ob_${suffix}`;
const control = new Pool(config);
const admin = new Pool({ ...config, database });
const pools: Pool[] = [];
const logins: string[] = [];
const groups = [
  "ggs_ob_owner",
  "ggs_ob_executor",
  "ggs_ob_operator",
  "ggs_ob_setup",
  "ggs_ob_reader",
  "ggs_ob_maintenance",
  "ggs_ob_proof",
  "ggs_pilot_data_owner",
  "ggs_pilot_executor",
  "ggs_pilot_intake",
  "ggs_pilot_review",
  "anon",
  "authenticated",
  "service_role",
];
function migration(directory: string) {
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));
  assert.equal(files.length, 1);
  return readFileSync(`${directory}/${files[0]}`, "utf8");
}
const baseline = migration("proposals/application-storage/supabase/migrations");
const onboardingDirectory = "proposals/streamer-onboarding/supabase/migrations";
const proposal = readFileSync(
  `${onboardingDirectory}/20261102061549_streamer_onboarding.sql`,
  "utf8",
);
const providerProposal = readFileSync(
  `${onboardingDirectory}/20261102225344_provider_operation_store.sql`,
  "utf8",
);
const recoveryProposal = readFileSync(
  `${onboardingDirectory}/20261102234438_owner_recovery_review.sql`,
  "utf8",
);
const owner = "00000000-0000-4000-8000-000000000001";
let operator: Pool,
  setup: Pool,
  reader: Pool,
  maintenance: Pool,
  migrator: Pool;
let proof: Pool;
let migratorName: string;
const deniedPools: Pool[] = [];
let app: string,
  binding: string,
  invite: string,
  subject: string,
  lease: string;
let created = false;

async function login(label: string, group?: string, privileged = false) {
  const name = `ggs_fixture_ob_${label}_${suffix}`;
  const password = randomBytes(32).toString("hex");
  await control.query(
    `create role ${name} login nosuperuser ${privileged ? "createrole createdb bypassrls" : "nocreaterole nocreatedb nobypassrls"} noreplication password '${password}'`,
  );
  logins.push(name);
  if (group) await control.query(`grant ${group} to ${name}`);
  const pool = new Pool({
    ...config,
    database,
    user: name,
    password,
    max: 3,
    application_name: `ob_${label}_${suffix}`,
  });
  pools.push(pool);
  return { name, pool };
}
before(async () => {
  const check = (
    await control.query(
      "select current_setting('server_version_num')::int version,current_user actor,current_database() database",
    )
  ).rows[0];
  assert.ok(check.version >= 170000 && check.version < 180000);
  assert.equal(check.actor, "ggs_test_admin");
  assert.equal(check.database, "ggs_pg17_isolated_test");
  assert.equal(
    (
      await control.query("select 1 from pg_roles where rolname=any($1)", [
        groups,
      ])
    ).rowCount,
    0,
    "Never adopt existing roles",
  );
  await control.query(`create database ${database}`);
  created = true;
  await control.query(
    "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls",
  );
  const m = await login("migrator", undefined, true);
  migrator = m.pool;
  migratorName = m.name;
  await admin.query(
    `grant create on database ${database} to ${migratorName}; alter default privileges for role ${migratorName} grant all on tables to public,anon,authenticated,service_role; alter default privileges for role ${migratorName} grant execute on functions to anon,authenticated,service_role`,
  );
  const c = await migrator.connect();
  try {
    await c.query("set ggs.reviewed_storage_proposal='testing-only'");
    await c.query(baseline);
    await assert.rejects(c.query(proposal), /Unapproved onboarding proposal/);
    await c.query("rollback");
    assert.equal(
      (
        await c.query(
          "select 1 from pg_namespace where nspname='ggs_onboarding'",
        )
      ).rowCount,
      0,
    );
    await c.query("set ggs.reviewed_onboarding_proposal='isolated-only'");
    await c.query(proposal);
    await assert.rejects(
      c.query(providerProposal),
      /Unapproved provider operation proposal/,
    );
    await c.query("rollback");
    assert.equal(
      (
        await admin.query(
          "select to_regclass('ggs_onboarding.provider_operations') object",
        )
      ).rows[0].object,
      null,
    );
    await c.query("set ggs.reviewed_provider_operations='isolated-only'");
    await c.query(providerProposal);
    await assert.rejects(
      c.query(recoveryProposal),
      /Unapproved owner recovery proposal/,
    );
    await c.query("rollback");
    assert.equal(
      (
        await admin.query(
          "select to_regprocedure('ggs_onboarding.prepare_provider_review(uuid,uuid)') function",
        )
      ).rows[0].function,
      null,
    );
    await c.query("set ggs.reviewed_owner_recovery='isolated-only'");
    await c.query(recoveryProposal);
  } finally {
    c.release();
  }
  operator = (await login("operator", "ggs_ob_operator")).pool;
  setup = (await login("setup", "ggs_ob_setup")).pool;
  reader = (await login("reader", "ggs_ob_reader")).pool;
  maintenance = (await login("maintenance", "ggs_ob_maintenance")).pool;
  proof = (await login("proof", "ggs_ob_proof")).pool;
  for (const group of [
    "anon",
    "authenticated",
    "service_role",
    "ggs_pilot_intake",
    "ggs_pilot_review",
  ])
    deniedPools.push((await login(`deny${deniedPools.length}`, group)).pool);
});
beforeEach(async () => {
  await admin.query(
    "truncate ggs_onboarding.provider_events,ggs_onboarding.provider_operations,ggs_onboarding.onboarding_events,ggs_onboarding.streamer_profiles,ggs_onboarding.setup_progress,ggs_onboarding.onboarding_operations,ggs_onboarding.invitation_bindings,ggs_pilot.application_events,ggs_pilot.application_operations,ggs_pilot.applications; delete from ggs_pilot.review_configuration",
  );
  await admin.query(
    "insert into ggs_pilot.review_configuration(owner_auth_id) values($1)",
    [owner],
  );
  app = randomUUID();
  binding = randomUUID();
  invite = randomUUID();
  subject = randomUUID();
  lease = randomUUID();
  await seedApplication(app);
});
after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
  await admin.end();
  if (created) {
    assert.match(database, /^ggs_ob_[a-f0-9]{12}$/);
    await control.query(`drop database ${database}`);
    for (const name of logins) await control.query(`drop role ${name}`);
    for (const group of groups)
      await control.query(`drop role if exists ${group}`);
  }
  await control.end();
});
async function seedApplication(id: string) {
  await admin.query(
    "insert into ggs_pilot.applications(id,creator_name,email,country,platform,profile_url,locale,review_state,revision,decided_at,decided_by,reason_code) values($1,'Fictional Creator',$2,'Colombia','twitch','https://example.invalid/creator','es','approved',2,clock_timestamp(),$3,'fit')",
    [id, `${id}@example.invalid`, owner],
  );
}
async function reserve(op = invite, b = binding, a = app, actor = owner) {
  return operator.query(
    "select ggs_onboarding.reserve_invitation($1,$2,2,$3,$4) revision",
    [actor, a, b, op],
  );
}
async function operate(
  action: string,
  payload: object,
  expected = 1,
  op = invite,
  client: Pool | PoolClient = operator,
) {
  return client.query(
    "select ggs_onboarding.operator_transition($1,$2,$3,$4,$5,$6) revision",
    [owner, binding, op, expected, action, JSON.stringify(payload)],
  );
}
async function step(
  action: string,
  expected: number,
  payload: object = {},
  op: string = randomUUID(),
  actor = subject,
  client: Pool | PoolClient = setup,
) {
  return client.query(
    "select ggs_onboarding.setup_transition($1,$2,$3,$4,$5,$6) revision",
    [actor, binding, op, expected, action, JSON.stringify(payload)],
  );
}
const details = () => ({
  displayName: "Fictional Creator",
  country: "Colombia",
  platform: "twitch",
  profileUrl: "https://example.invalid/creator",
  locale: "es",
  expectedProfileRevision: 0,
});
async function issued() {
  await reserve();
  await operate("claim", { lease });
  const payload = {
    lease,
    subject,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  await operate("issued", payload);
  return payload;
}
async function passwordReady() {
  await issued();
  await step("accept", 2, { evidence: randomUUID() });
  await step("password", 3, { evidence: randomUUID() });
}
async function profileReady() {
  await passwordReady();
  await step("profile", 4, details());
}
const state = async () =>
  (
    await admin.query(
      "select state,membership,revision from ggs_onboarding.invitation_bindings where id=$1",
      [binding],
    )
  ).rows[0];
const count = async (table: string) =>
  Number(
    (await admin.query(`select count(*) n from ggs_onboarding.${table}`))
      .rows[0].n,
  );
const read = () =>
  reader.query("select ggs_onboarding.read_self($1,$2) result", [
    subject,
    binding,
  ]);

function fixtureAdapter(channel: OnboardingQuery = setup) {
  const model: {
    user: VerifiedPilotUser | null;
    verifications: number;
    evidenceReads: number;
  } = {
    user: {
      id: subject,
      email_confirmed_at: "2020-01-01T00:00:00Z",
      is_anonymous: false,
    },
    verifications: 0,
    evidenceReads: 0,
  };
  const evidence = new Map<string, string>();
  const adapter = createOnboardingAdapter({
    mode: "isolated-fixture",
    ownerUserId: owner,
    setup: channel,
    reader,
    verify: async () => {
      model.verifications++;
      return { data: { user: model.user }, error: null };
    },
    verifyEvidence: async (request) => {
      model.evidenceReads++;
      const key = JSON.stringify(request);
      if (!evidence.has(key)) evidence.set(key, randomUUID());
      return { ...request, evidenceId: evidence.get(key), verified: true };
    },
  });
  return { adapter, model };
}
const adapterCommand = (
  expectedBindingRevision: number,
  operationId = randomUUID(),
) => ({ invitationId: binding, expectedBindingRevision, operationId });
const adapterFailure = (reason: string) => (error: unknown) =>
  error instanceof OnboardingAdapterError && error.reason === reason;

test("fixture Auth and real adapter persist setup through restricted channels without opening a workspace", async () => {
  await issued();
  const { adapter, model } = fixtureAdapter();
  assert.deepEqual(await adapter.recordVerifiedInvitation(adapterCommand(2)), {
    revision: 3,
  });
  assert.deepEqual(await adapter.recordVerifiedPassword(adapterCommand(3)), {
    revision: 4,
  });
  assert.deepEqual(
    await adapter.saveProfile({ ...adapterCommand(4), ...details() }),
    { revision: 5 },
  );
  const preview = await adapter.readSelf({ invitationId: binding });
  assert.equal(preview.membership, "pending");
  assert.equal(preview.profile?.displayName, "Fictional Creator");
  assert.equal(preview.workspaceAccess, false);
  assert.deepEqual(await adapter.finalize(adapterCommand(5)), { revision: 6 });
  assert.equal(
    (await adapter.readSelf({ invitationId: binding })).workspaceAccess,
    false,
  );
  assert.equal(model.verifications, 8);
  assert.equal(model.evidenceReads, 2);
  await operate("revoke", {}, 6, randomUUID());
  await assert.rejects(
    adapter.readSelf({ invitationId: binding }),
    adapterFailure("denied"),
  );
  assert.equal(model.verifications, 9);
});

test("adapter binds fresh fixture identity rather than profile metadata or a requested subject", async () => {
  await profileReady();
  const { adapter, model } = fixtureAdapter();
  model.user = {
    id: randomUUID(),
    email_confirmed_at: "2020-01-01T00:00:00Z",
    is_anonymous: false,
    app_metadata: {},
    user_metadata: { subject },
  } as VerifiedPilotUser;
  await assert.rejects(
    adapter.readSelf({ invitationId: binding }),
    adapterFailure("denied"),
  );
  await assert.rejects(
    adapter.readSelf({ invitationId: binding, subject }),
    adapterFailure("invalid"),
  );
  assert.equal(model.verifications, 1);
});

test("lost acknowledgement after profile commit has no automatic retry and exact retry creates no duplicate", async () => {
  await passwordReady();
  let writes = 0;
  const flaky: OnboardingQuery = {
    query: async (sql, values) => {
      const result = await setup.query(sql, values);
      writes++;
      if (writes === 1) throw new Error("fixture acknowledgement lost");
      return result;
    },
  };
  const { adapter } = fixtureAdapter(flaky);
  const command = { ...adapterCommand(4), ...details() };
  await assert.rejects(
    adapter.saveProfile(command),
    adapterFailure("unavailable"),
  );
  assert.equal(writes, 1);
  assert.equal(await count("streamer_profiles"), 1);
  assert.deepEqual(await adapter.saveProfile(command), { revision: 5 });
  assert.equal(writes, 2);
  assert.equal(
    (
      await admin.query(
        "select 1 from ggs_onboarding.onboarding_events where kind='profile'",
      )
    ).rowCount,
    1,
  );
});

test("lost acknowledgement after password receipt requires reconciliation and preserves one evidence operation", async () => {
  await issued();
  await step("accept", 2, { evidence: randomUUID() });
  let writes = 0;
  const flaky: OnboardingQuery = {
    query: async (sql, values) => {
      const result = await setup.query(sql, values);
      writes++;
      if (writes === 1) throw new Error("fixture acknowledgement lost");
      return result;
    },
  };
  const { adapter, model } = fixtureAdapter(flaky);
  const command = adapterCommand(3);
  await assert.rejects(
    adapter.recordVerifiedPassword(command),
    adapterFailure("reconciliation-required"),
  );
  assert.equal(writes, 1);
  assert.equal(model.evidenceReads, 1);
  // Explicit fixture reconciliation: reread the same durable proof, not a provider mutation.
  assert.deepEqual(await adapter.recordVerifiedPassword(command), {
    revision: 4,
  });
  assert.equal(
    (
      await admin.query(
        "select 1 from ggs_onboarding.onboarding_events where kind='password'",
      )
    ).rowCount,
    1,
  );
});

test("actual SDK HTTP fixture and restricted PostgreSQL channels complete setup with private cookies", async () => {
  await issued();
  const wire = setupWireFixture(subject);
  const client = setupHttpClient({ ...wire.deps, setup, reader });
  const inviteCommand = wire.seed("invitation", binding, 2);
  const inviteResponse = await client.send("invitation", {
    ...inviteCommand,
    tokenHash: "a".repeat(64),
  });
  assert.equal(inviteResponse.status, 200);
  assert.ok(inviteResponse.cookies.getAll().every((cookie) => cookie.httpOnly));
  const passwordCommand = wire.seed("password", binding, 3);
  const secret = "Fictional-HTTP-Password-Only";
  const passwordBody = {
    ...passwordCommand,
    newPassword: secret,
    confirmPassword: secret,
  };
  assert.equal((await client.send("password", passwordBody)).status, 200);
  assert.equal((await client.send("password", passwordBody)).status, 409);
  const receipt = await client.send("password-receipt", passwordCommand);
  assert.equal(receipt.status, 200);
  assert.equal((await receipt.json()).receipt, true);
  assert.equal(wire.state.passwordUpdates, 1);
  assert.equal(
    (await client.send("profile", { ...adapterCommand(4), ...details() }))
      .status,
    200,
  );
  assert.equal((await client.send("finalize", adapterCommand(5))).status, 200);
  const response = await client.send("status", { invitationId: binding });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.membership, "active");
  assert.equal(body.workspaceAccess, false);
  assert.equal(JSON.stringify(body).includes(secret), false);
  await operate("revoke", {}, 6, randomUUID());
  assert.equal(
    (await client.send("status", { invitationId: binding })).status,
    403,
  );
});

test("migration is guarded, managed-style and restores temporary owner memberships", async () => {
  const roles = await admin.query(
    "select rolcanlogin,rolbypassrls,rolsuper from pg_roles where rolname like 'ggs_ob_%'",
  );
  assert.equal(roles.rowCount, 7);
  assert.ok(
    roles.rows.every((r) => !r.rolcanlogin && !r.rolbypassrls && !r.rolsuper),
  );
  const tables = await admin.query(
    "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ggs_onboarding' and relkind='r'",
  );
  assert.equal(tables.rowCount, 7);
  assert.ok(
    tables.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
  );
  for (const role of [
    "ggs_ob_owner",
    "ggs_ob_executor",
    "ggs_pilot_data_owner",
  ]) {
    const r = (
      await migrator.query(
        "select pg_has_role(current_user,$1,'USAGE') inherited,pg_has_role(current_user,$1,'SET') can_set",
        [role],
      )
    ).rows[0];
    assert.equal(r.inherited, false);
    assert.equal(r.can_set, false);
  }
  await assert.rejects(
    migrator.query("select * from ggs_onboarding.streamer_profiles"),
  );
});
test("runtime and broad API roles have no direct tables or internal helpers", async () => {
  for (const pool of [operator, setup, reader, maintenance, ...deniedPools]) {
    await assert.rejects(
      pool.query("select * from ggs_onboarding.streamer_profiles"),
    );
    await assert.rejects(
      pool.query(
        "update ggs_onboarding.invitation_bindings set membership='active'",
      ),
    );
    await assert.rejects(
      pool.query("select ggs_onboarding._owner($1)", [owner]),
    );
    await assert.rejects(pool.query("set role ggs_ob_executor"));
  }
  await assert.rejects(
    setup.query("select ggs_onboarding.reserve_invitation($1,$2,2,$3,$4)", [
      owner,
      app,
      binding,
      invite,
    ]),
  );
  await assert.rejects(
    reader.query(
      "select ggs_onboarding.setup_transition($1,$2,$3,1,'finalize','{}')",
      [subject, binding, invite],
    ),
  );
});
test("reservation checks owner, current approved revision and exact retry identity", async () => {
  await assert.rejects(reserve(invite, binding, app, subject));
  await reserve();
  await reserve();
  assert.equal(await count("invitation_bindings"), 1);
  assert.equal(await count("onboarding_events"), 1);
  await assert.rejects(
    operator.query("select ggs_onboarding.reserve_invitation($1,$2,1,$3,$4)", [
      owner,
      app,
      binding,
      invite,
    ]),
  );
  await assert.rejects(reserve(invite, randomUUID()));
  assert.equal((await state()).membership, "pending");
});
test("rejected applications and missing owner configuration cannot reserve", async () => {
  await admin.query(
    "update ggs_pilot.applications set review_state='rejected' where id=$1",
    [app],
  );
  await assert.rejects(reserve());
  await admin.query(
    "update ggs_pilot.applications set review_state='approved' where id=$1;",
    [app],
  );
  await admin.query("delete from ggs_pilot.review_configuration");
  await assert.rejects(reserve());
  assert.equal(await count("invitation_bindings"), 0);
});
test("claimed invitation cannot be automatically resent; uncertain result reconciles once", async () => {
  await reserve();
  await operate("claim", { lease });
  await assert.rejects(operate("claim", { lease }));
  await assert.rejects(
    operate("issued", {
      lease: randomUUID(),
      subject,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    }),
  );
  await operate("uncertain", { lease });
  await operate("uncertain", { lease });
  const payload = {
    lease,
    subject,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  await assert.rejects(operate("issued", payload));
  await operate("reconcile-issued", payload);
  await operate("reconcile-issued", payload);
  assert.equal(await count("setup_progress"), 1);
  assert.equal((await state()).revision, 2);
  await assert.rejects(
    operate("reconcile-issued", { ...payload, subject: randomUUID() }),
  );
});
test("expired lease cannot claim success and preserves evidence for reconciliation", async () => {
  await reserve();
  await operate("claim", { lease });
  await admin.query(
    "update ggs_onboarding.onboarding_operations set lease_until=clock_timestamp()-interval '1 second' where operation_id=$1",
    [invite],
  );
  await assert.rejects(
    operate("issued", {
      lease,
      subject,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    }),
  );
  assert.equal((await state()).state, "reserved");
  await operate("uncertain", { lease });
  assert.equal(
    (
      await admin.query(
        "select state from ggs_onboarding.onboarding_operations where operation_id=$1",
        [invite],
      )
    ).rows[0].state,
    "reconcile",
  );
});

test("issued receipt retry binds the same instant across database time zones", async () => {
  const payload = await issued();
  const c = await operator.connect();
  try {
    await c.query("set timezone='America/Bogota'");
    const result = await operate("issued", payload, 1, invite, c);
    assert.equal(result.rows[0].revision, 2);
  } finally {
    await c.query("set timezone='UTC'");
    c.release();
  }
  assert.equal(await count("setup_progress"), 1);
});
test("wrong subject, unaccepted invitation and missing password cannot save profiles", async () => {
  await issued();
  await assert.rejects(
    step("accept", 2, { evidence: randomUUID() }, randomUUID(), randomUUID()),
  );
  await assert.rejects(step("profile", 2, details()));
  await step("accept", 2, { evidence: randomUUID() });
  await assert.rejects(step("profile", 3, details()));
  await assert.rejects(step("finalize", 3));
  assert.equal(await count("streamer_profiles"), 0);
});
test("unused expiry denies acceptance; accepted invitation outlives its old link", async () => {
  await issued();
  await admin.query(
    "update ggs_onboarding.invitation_bindings set issued_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",
    [binding],
  );
  await assert.rejects(step("accept", 2, { evidence: randomUUID() }));
  await admin.query(
    "update ggs_onboarding.invitation_bindings set expires_at=clock_timestamp()+interval '1 hour' where id=$1",
    [binding],
  );
  await step("accept", 2, { evidence: randomUUID() });
  await admin.query(
    "update ggs_onboarding.invitation_bindings set issued_at=clock_timestamp()-interval '3 hours',accepted_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",
    [binding],
  );
  await step("password", 3, { evidence: randomUUID() });
});
test("profile persistence and finalization are separate; self-read is scoped", async () => {
  await profileReady();
  assert.equal((await state()).membership, "pending");
  const result = (await read()).rows[0].result;
  assert.equal(result.profile.displayName, "Fictional Creator");
  assert.equal(result.profile.email, undefined);
  await assert.rejects(
    reader.query("select ggs_onboarding.read_self($1,$2)", [
      randomUUID(),
      binding,
    ]),
  );
  await step("finalize", 5);
  assert.equal((await state()).membership, "active");
  await assert.rejects(step("password", 6, { evidence: randomUUID() }));
});
test("profile exact retry has one event, while changed payload or stale revision conflicts", async () => {
  await passwordReady();
  const op = randomUUID();
  await step("profile", 4, details(), op);
  await step("profile", 4, details(), op);
  await assert.rejects(
    step("profile", 4, { ...details(), country: "Peru" }, op),
  );
  await assert.rejects(step("profile", 4, details()));
  assert.equal(await count("streamer_profiles"), 1);
  assert.equal(
    (
      await admin.query(
        "select count(*) n from ggs_onboarding.onboarding_events where kind='profile'",
      )
    ).rows[0].n,
    "1",
  );
});
test("profile payload rejects extra authority, invalid types, insecure URLs and unknown fields", async () => {
  await passwordReady();
  for (const change of [
    { role: "owner" },
    { password: "DO-NOT-STORE" },
    { displayName: 55 },
    { profileUrl: "javascript:alert(1)" },
    { profileUrl: "https://name:secret@example.invalid" },
    { locale: "fr" },
    { expectedProfileRevision: 1 },
  ])
    await assert.rejects(step("profile", 4, { ...details(), ...change }));
  assert.equal(await count("streamer_profiles"), 0);
  assert.equal((await state()).revision, 4);
});
test("audit failure rolls back profile, progress, receipt and binding revision together", async () => {
  await passwordReady();
  const op = randomUUID();
  await admin.query(
    "create function ggs_onboarding.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure'; end$$; create trigger fixture_fail before insert on ggs_onboarding.onboarding_events for each row execute function ggs_onboarding.fixture_fail()",
  );
  try {
    await assert.rejects(step("profile", 4, details(), op));
  } finally {
    await admin.query(
      "drop trigger fixture_fail on ggs_onboarding.onboarding_events; drop function ggs_onboarding.fixture_fail()",
    );
  }
  assert.equal(await count("streamer_profiles"), 0);
  assert.equal((await state()).revision, 4);
  assert.equal(
    (
      await admin.query(
        "select 1 from ggs_onboarding.onboarding_operations where operation_id=$1",
        [op],
      )
    ).rowCount,
    0,
  );
  await step("profile", 4, details(), op);
});
test("revocation denies reads and old successful mutation receipts on reused pools", async () => {
  await passwordReady();
  const op = randomUUID();
  await step("profile", 4, details(), op);
  await read();
  await operate("revoke", {}, 5, randomUUID());
  await assert.rejects(read());
  await assert.rejects(step("profile", 4, details(), op));
  await assert.rejects(step("finalize", 6));
  assert.equal((await state()).membership, "suspended");
});
test("due-only fictional redaction removes profile payload and sensitive fingerprints atomically", async () => {
  await profileReady();
  const op = randomUUID();
  const redact = () =>
    maintenance.query("select ggs_onboarding.redact_profile($1,$2,$3,6)", [
      owner,
      binding,
      op,
    ]);
  await assert.rejects(redact());
  await operate("revoke", {}, 5, randomUUID());
  await assert.rejects(redact());
  await admin.query(
    "update ggs_onboarding.invitation_bindings set revoked_at=clock_timestamp()-interval '91 days' where id=$1",
    [binding],
  );
  await redact();
  await redact();
  const row = (
    await admin.query(
      "select display_name,country,profile_url,redacted_at from ggs_onboarding.streamer_profiles",
    )
  ).rows[0];
  assert.equal(row.display_name, null);
  assert.equal(row.country, null);
  assert.equal(row.profile_url, null);
  assert.ok(row.redacted_at);
  assert.equal(
    (
      await admin.query(
        "select 1 from ggs_onboarding.onboarding_operations where purpose<>'redact' and request_hash is not null",
      )
    ).rowCount,
    0,
  );
  assert.ok((await count("onboarding_events")) > 0);
  await assert.rejects(read());
});

async function waitLocks(minimum: number) {
  for (let i = 0; i < 120; i++) {
    const rows = await admin.query(
      "select pid from pg_stat_activity where datname=$1 and application_name like $2 and wait_event_type='Lock'",
      [database, `ob_%_${suffix}`],
    );
    if (rows.rowCount! >= minimum) return;
    await delay(25);
  }
  throw new Error(
    "Independent onboarding backends did not overlap at lock barrier",
  );
}

test("executor application lock grant cannot modify applications or read contacts", async () => {
  const c = await admin.connect();
  try {
    await c.query("set session authorization ggs_ob_executor");
    await c.query("select id from ggs_pilot.applications for share");
    await assert.rejects(c.query("update ggs_pilot.applications set id=id"));
    await assert.rejects(c.query("select email from ggs_pilot.applications"));
    await assert.rejects(
      c.query("delete from ggs_onboarding.onboarding_events"),
    );
    await assert.rejects(
      c.query("update ggs_onboarding.onboarding_events set kind='finalize'"),
    );
  } finally {
    await c.query("reset session authorization");
    c.release();
  }
});

test("one provider subject cannot be assigned to two live invitation bindings", async () => {
  await issued();
  const otherApp = randomUUID(),
    otherBinding = randomUUID(),
    otherOp = randomUUID();
  await seedApplication(otherApp);
  await reserve(otherOp, otherBinding, otherApp);
  await operator.query(
    "select ggs_onboarding.operator_transition($1,$2,$3,1,'claim',$4)",
    [owner, otherBinding, otherOp, JSON.stringify({ lease })],
  );
  await assert.rejects(
    operator.query(
      "select ggs_onboarding.operator_transition($1,$2,$3,1,'issued',$4)",
      [
        owner,
        otherBinding,
        otherOp,
        JSON.stringify({
          lease,
          subject,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      ],
    ),
  );
  assert.equal(
    (
      await admin.query(
        "select 1 from ggs_onboarding.invitation_bindings where subject=$1",
        [subject],
      )
    ).rowCount,
    1,
  );
});

test("approval is rechecked after waiting for the parent application lock", async () => {
  const c = await admin.connect();
  await c.query("begin");
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await c.query(
      "select 1 from ggs_pilot.applications where id=$1 for update",
      [app],
    );
    pending = Promise.allSettled([reserve()]);
    await waitLocks(1);
    await c.query(
      "update ggs_pilot.applications set review_state='rejected' where id=$1",
      [app],
    );
    await c.query("commit");
  } finally {
    await c.query("rollback");
    c.release();
  }
  assert.equal((await pending!)[0]!.status, "rejected");
  assert.equal(await count("invitation_bindings"), 0);
});

test("redaction audit failure preserves fictional profile and receipt fingerprints", async () => {
  await profileReady();
  await operate("revoke", {}, 5, randomUUID());
  await admin.query(
    "update ggs_onboarding.invitation_bindings set revoked_at=clock_timestamp()-interval '91 days' where id=$1",
    [binding],
  );
  await admin.query(
    "create function ggs_onboarding.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure'; end$$; create trigger fixture_fail before insert on ggs_onboarding.onboarding_events for each row execute function ggs_onboarding.fixture_fail()",
  );
  try {
    await assert.rejects(
      maintenance.query("select ggs_onboarding.redact_profile($1,$2,$3,6)", [
        owner,
        binding,
        randomUUID(),
      ]),
    );
  } finally {
    await admin.query(
      "drop trigger fixture_fail on ggs_onboarding.onboarding_events; drop function ggs_onboarding.fixture_fail()",
    );
  }
  assert.equal(
    (
      await admin.query(
        "select display_name from ggs_onboarding.streamer_profiles",
      )
    ).rows[0].display_name,
    "Fictional Creator",
  );
  assert.equal(
    (
      await admin.query(
        "select 1 from ggs_onboarding.onboarding_operations where request_hash is null",
      )
    ).rowCount,
    0,
  );
});

test("a changed owner configuration invalidates old setup and self-read authority", async () => {
  await passwordReady();
  await read();
  await admin.query(
    "update ggs_pilot.review_configuration set owner_auth_id=$1",
    [randomUUID()],
  );
  await assert.rejects(read());
  await assert.rejects(step("profile", 4, details()));
  assert.equal(await count("streamer_profiles"), 0);
});
async function blockedRace(
  lock: (c: PoolClient) => Promise<unknown>,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const blocker = await admin.connect();
  await blocker.query("begin");
  let outcomes: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await lock(blocker);
    const one = first();
    outcomes = Promise.allSettled([one]);
    await waitLocks(1);
    const two = second();
    outcomes = Promise.allSettled([one, two]);
    await waitLocks(2);
  } finally {
    await blocker.query("rollback");
    blocker.release();
  }
  return outcomes!;
}
test("independent simultaneous reservation attempts produce one live binding", async () => {
  const outcomes = await blockedRace(
    (c) =>
      c.query("select pg_advisory_xact_lock(hashtextextended($1,27))", [app]),
    () => reserve(),
    () => reserve(randomUUID(), randomUUID()),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await count("invitation_bindings"), 1);
  assert.equal(await count("onboarding_operations"), 1);
});
test("independent simultaneous profile writes produce one revision and audit event", async () => {
  await passwordReady();
  const outcomes = await blockedRace(
    (c) =>
      c.query(
        "select 1 from ggs_onboarding.invitation_bindings where id=$1 for update",
        [binding],
      ),
    () => step("profile", 4, details()),
    () => step("profile", 4, details()),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await count("streamer_profiles"), 1);
  assert.equal((await state()).revision, 5);
});
for (const revokeFirst of [true, false])
  test(`revocation wins finalization race with revokeFirst=${revokeFirst}`, async () => {
    await profileReady();
    const revoke = () => operate("revoke", {}, 5, randomUUID());
    const finalize = () => step("finalize", 5);
    await blockedRace(
      (c) =>
        c.query(
          "select 1 from ggs_onboarding.invitation_bindings where id=$1 for update",
          [binding],
        ),
      revokeFirst ? revoke : finalize,
      revokeFirst ? finalize : revoke,
    );
    assert.equal((await state()).membership, "suspended");
    assert.equal((await state()).state, "revoked");
    await assert.rejects(read());
  });

function durableStore(channel: OnboardingQuery = proof) {
  return createFixtureOperationStore({ mode: "isolated-fixture", channel });
}
function providerKey(
  kind: StepKey["kind"] = "invitation",
  revision = 2,
): StepKey {
  return { ...adapterCommand(revision), kind };
}
async function claimProvider(key = providerKey()) {
  return (await durableStore().claim(
    key,
    key.kind === "password" ? subject : null,
  )) as FixtureOperation;
}
async function resolveProvider(
  row: FixtureOperation,
  decision = "no-effect",
  version = 2,
  evidence: string | null = null,
  review: string = randomUUID(),
  actor = owner,
) {
  return operator.query(
    "select ggs_onboarding.resolve_provider_step($1,$2,$3,$4,$5,$6) revision",
    [actor, row.operationId, version, decision, review, evidence],
  );
}

test("durable store survives new instances and completes actual SDK/HTTP setup without repeated effects", async () => {
  await issued();
  const wire = setupWireFixture(subject);
  const client = setupHttpClient({
    ...wire.deps,
    ownerUserId: owner,
    setup,
    reader,
    operations: durableStore(),
  });
  const invitation = adapterCommand(2);
  assert.equal(
    (
      await client.send("invitation", {
        ...invitation,
        tokenHash: "a".repeat(64),
      })
    ).status,
    200,
  );
  const password = adapterCommand(3);
  const body = {
    ...password,
    newPassword: "Fictional-Durable-Password",
    confirmPassword: "Fictional-Durable-Password",
  };
  assert.equal((await client.send("password", body)).status, 200);
  const restarted = setupHttpClient({
    ...wire.deps,
    ownerUserId: owner,
    setup,
    reader,
    operations: durableStore(),
  });
  for (const [name, value] of client.jar) restarted.jar.set(name, value);
  assert.equal((await restarted.send("password", body)).status, 409);
  assert.equal(
    (await restarted.send("password-receipt", password)).status,
    200,
  );
  assert.equal(
    (await restarted.send("password", { ...body, operationId: randomUUID() }))
      .status,
    403,
  );
  assert.equal(wire.state.passwordUpdates, 1);
  assert.equal(wire.state.tokenUses, 1);
  assert.equal(
    (await restarted.send("profile", { ...adapterCommand(4), ...details() }))
      .status,
    200,
  );
  assert.equal(
    (await restarted.send("finalize", adapterCommand(5))).status,
    200,
  );
  assert.equal(
    (await restarted.send("password-receipt", password)).status,
    200,
  );
  const stored = JSON.stringify(
    (
      await admin.query(
        "select to_jsonb(o) record from ggs_onboarding.provider_operations o",
      )
    ).rows,
  );
  assert.ok(
    !stored.includes(body.newPassword) && !stored.includes("a".repeat(64)),
  );
  assert.equal(await count("provider_operations"), 2);
  assert.equal(await count("provider_events"), 4);
});

test("competing durable claims expose a nonce only once and block new operation IDs", async () => {
  await issued();
  const key = providerKey();
  const rows = await Promise.all([claimProvider(key), claimProvider(key)]);
  assert.equal(rows.filter((r) => r.state === "claimed").length, 1);
  assert.equal(rows.filter((r) => r.claimId === null).length, 1);
  await assert.rejects(claimProvider(providerKey()), /reconciliation-required/);
  assert.equal(await count("provider_events"), 1);
});

test("expired claims persist reconciliation and never grant a replacement claim", async () => {
  await issued();
  const key = providerKey();
  const row = await claimProvider(key);
  await admin.query(
    "update ggs_onboarding.provider_operations set lease_until=clock_timestamp()-interval '1 second'",
  );
  const again = await claimProvider(key);
  assert.equal(again.state, "reconcile");
  assert.equal(again.claimId, null);
  await assert.rejects(
    durableStore().verified(row, randomUUID()),
    /reconciliation-required/,
  );
  await assert.rejects(claimProvider(), /reconciliation-required/);
  assert.equal(await count("provider_events"), 2);
});

test("wrong claim nonce, subject and cross-binding operation reuse are denied", async () => {
  await issued();
  const key = providerKey();
  const row = await claimProvider(key);
  await assert.rejects(
    durableStore().verified({ ...row, claimId: randomUUID() }, randomUUID()),
    /denied/,
  );
  await durableStore().verified(row, randomUUID());
  await assert.rejects(durableStore().read(key, randomUUID()), /denied/);
  await assert.rejects(
    claimProvider({ ...key, invitationId: randomUUID() }),
    /denied/,
  );
  await assert.rejects(
    claimProvider({ ...key, expectedBindingRevision: 3 }),
    /reconciliation-required/,
  );
});

test("lost completion acknowledgement preserves immutable verified evidence", async () => {
  await issued();
  const key = providerKey();
  const row = await claimProvider(key);
  const evidence = randomUUID();
  const lossy: OnboardingQuery = {
    query: async (sql, values) => {
      await proof.query(sql, values);
      throw new Error("fictional lost acknowledgement");
    },
  };
  await assert.rejects(
    durableStore(lossy).verified(row, evidence),
    /unavailable/,
  );
  await durableStore().uncertain(row);
  await durableStore().verified(row, evidence);
  await assert.rejects(
    durableStore().verified(row, randomUUID()),
    /reconciliation-required/,
  );
  const result = (await durableStore().read(key, subject)) as FixtureOperation;
  assert.equal(result.state, "verified");
  assert.equal(result.evidenceId, evidence);
  assert.equal(result.claimId, null);
  assert.equal(await count("provider_events"), 2);
});

test("revocation before completion denies evidence but still permits uncertainty cleanup", async () => {
  await issued();
  const row = await claimProvider();
  await operate("revoke", {}, 2, randomUUID());
  await assert.rejects(durableStore().verified(row, randomUUID()), /denied/);
  await durableStore().uncertain(row);
  assert.equal(
    (await admin.query("select state from ggs_onboarding.provider_operations"))
      .rows[0].state,
    "reconcile",
  );
  await assert.rejects(
    resolveProvider(row, "verified", 2, randomUUID()),
    /Denied/,
  );
  await resolveProvider(row);
});

test("binding drift during provider effect persists reconciliation instead of proof", async () => {
  await issued();
  const row = await claimProvider();
  await step("accept", 2, { evidence: randomUUID() });
  await assert.rejects(
    durableStore().verified(row, randomUUID()),
    /reconciliation-required/,
  );
  assert.equal(
    (await admin.query("select state from ggs_onboarding.provider_operations"))
      .rows[0].state,
    "reconcile",
  );
});

test("preflight refuses unissued bindings, stale approval, wrong password subject and completed steps", async () => {
  await assert.rejects(claimProvider(), /denied/);
  await issued();
  await assert.rejects(
    durableStore().claim(providerKey("password", 3), randomUUID()),
    /denied/,
  );
  await assert.rejects(claimProvider(providerKey("password", 2)), /denied/);
  await step("accept", 2, { evidence: randomUUID() });
  await step("password", 3, { evidence: randomUUID() });
  await assert.rejects(claimProvider(providerKey("password", 4)), /denied/);
  await admin.query(
    "update ggs_pilot.applications set decided_by=$2 where id=$1",
    [app, randomUUID()],
  );
  await assert.rejects(claimProvider(), /denied/);
});

test("owner no-effect resolution is versioned, idempotent and fences stale writers", async () => {
  await issued();
  const row = await claimProvider();
  const review = randomUUID();
  await assert.rejects(resolveProvider(row), /Conflict/);
  await durableStore().uncertain(row);
  await assert.rejects(
    resolveProvider(row, "no-effect", 2, null, review, subject),
    /Denied/,
  );
  await assert.rejects(
    resolveProvider(row, "no-effect", 1, null, review),
    /Conflict/,
  );
  assert.equal(
    (await resolveProvider(row, "no-effect", 2, null, review)).rows[0].revision,
    3,
  );
  assert.equal(
    (await resolveProvider(row, "no-effect", 2, null, review)).rows[0].revision,
    3,
  );
  await assert.rejects(
    resolveProvider(row, "verified", 3, randomUUID()),
    /Conflict/,
  );
  await assert.rejects(
    durableStore().verified(row, randomUUID()),
    /reconciliation-required/,
  );
  await durableStore().uncertain(row);
  assert.equal((await claimProvider()).state, "claimed");
  assert.equal(await count("provider_events"), 4);
});

test("owner verified resolution recovers a receipt without repeating provider effects", async () => {
  await issued();
  const key = providerKey();
  const row = await claimProvider(key);
  await durableStore().uncertain(row);
  const evidence = randomUUID();
  await resolveProvider(row, "verified", 2, evidence);
  const result = (await durableStore().read(key, subject)) as FixtureOperation;
  assert.equal(result.evidenceId, evidence);
  assert.equal(result.state, "verified");
  await step("accept", 2, { evidence }, key.operationId);
  assert.equal(
    ((await durableStore().read(key, subject)) as FixtureOperation).evidenceId,
    evidence,
  );
  await assert.rejects(claimProvider(), /denied/);
});

test("provider audit failures roll back claim, verification and owner resolution atomically", async () => {
  await issued();
  const trigger =
    "create function ggs_onboarding.fixture_provider_fail() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure';end$$;create trigger fixture_provider_fail before insert on ggs_onboarding.provider_events for each row execute function ggs_onboarding.fixture_provider_fail()";
  const remove =
    "drop trigger fixture_provider_fail on ggs_onboarding.provider_events;drop function ggs_onboarding.fixture_provider_fail()";
  await admin.query(trigger);
  try {
    await assert.rejects(claimProvider(), /unavailable/);
  } finally {
    await admin.query(remove);
  }
  assert.equal(await count("provider_operations"), 0);
  const row = await claimProvider();
  await admin.query(trigger);
  try {
    await assert.rejects(
      durableStore().verified(row, randomUUID()),
      /unavailable/,
    );
  } finally {
    await admin.query(remove);
  }
  assert.equal(
    (await admin.query("select state from ggs_onboarding.provider_operations"))
      .rows[0].state,
    "claimed",
  );
  await durableStore().uncertain(row);
  await admin.query(trigger);
  try {
    await assert.rejects(resolveProvider(row), /fixture audit failure/);
  } finally {
    await admin.query(remove);
  }
  assert.equal(
    (await admin.query("select state from ggs_onboarding.provider_operations"))
      .rows[0].state,
    "reconcile",
  );
});

test("proof capability has function-only access and cannot resolve, approve, activate or read profiles", async () => {
  for (const pool of [
    proof,
    operator,
    setup,
    reader,
    maintenance,
    ...deniedPools,
  ]) {
    await assert.rejects(
      pool.query("select * from ggs_onboarding.provider_operations"),
    );
    await assert.rejects(
      pool.query("delete from ggs_onboarding.provider_events"),
    );
    await assert.rejects(
      pool.query("select ggs_onboarding._provider_binding($1)", [binding]),
    );
  }
  for (const pool of [operator, setup, reader, maintenance, ...deniedPools])
    await assert.rejects(
      pool.query(
        "select ggs_onboarding.claim_provider_step('invitation',$1,$2,2,null,$3)",
        [binding, randomUUID(), randomUUID()],
      ),
    );
  await assert.rejects(
    proof.query(
      "select ggs_onboarding.resolve_provider_step($1,$2,2,'no-effect',$3,null)",
      [owner, randomUUID(), randomUUID()],
    ),
  );
  await assert.rejects(
    proof.query("select ggs_onboarding.read_self($1,$2)", [subject, binding]),
  );
  await assert.rejects(proof.query("set role ggs_ob_executor"));
});

function ownerRecovery(channel: OnboardingQuery = operator) {
  const state = {
    inspections: 0,
    user: approvedFixtureUser("owner") as VerifiedPilotUser | null,
  };
  const adapter = createOwnerRecoveryAdapter({
    mode: "isolated-fixture",
    ownerUserId: owner,
    operator: channel,
    verify: async () => ({ data: { user: state.user }, error: null }),
    inspectProvider: async (request) => {
      state.inspections++;
      return {
        ...request,
        confirmed: true,
        workerStopped: true,
        providerSettled: true,
        observedAt: new Date().toISOString(),
        evidenceId: request.decision === "verified" ? randomUUID() : null,
      };
    },
  });
  return { adapter, state };
}
test("owner adapter prepares expired claims with one atomic expiry event and no internal capability", async () => {
  await issued();
  const row = await claimProvider();
  await admin.query(
    "update ggs_onboarding.provider_operations set lease_until=clock_timestamp()-interval '1 second'",
  );
  const { adapter } = ownerRecovery();
  const prepared = await adapter.prepare({ operationId: row.operationId });
  assert.equal(prepared.state, "reconcile");
  assert.equal(prepared.version, 2);
  assert.ok(!("claimId" in prepared));
  assert.deepEqual(
    await adapter.prepare({ operationId: row.operationId }),
    prepared,
  );
  assert.equal(await count("provider_events"), 2);
});
test("fresh owner recovery confirms no effect, preserves review history and permits a new claim", async () => {
  await issued();
  const row = await claimProvider();
  await durableStore().uncertain(row);
  const { adapter, state } = ownerRecovery();
  const command = {
    operationId: row.operationId,
    expectedVersion: 2,
    reviewId: randomUUID(),
    decision: "no-effect",
  };
  assert.deepEqual(await adapter.resolve(command), {
    revision: 3,
    receipt: false,
  });
  assert.deepEqual(await adapter.resolve(command), {
    revision: 3,
    receipt: true,
  });
  assert.equal(state.inspections, 1);
  await assert.rejects(
    durableStore().verified(row, randomUUID()),
    /reconciliation-required/,
  );
  assert.equal((await claimProvider()).state, "claimed");
  assert.equal(await count("provider_events"), 4);
});
test("owner verified recovery provides evidence without another provider action and denial follows revocation", async () => {
  await issued();
  const key = providerKey();
  const row = await claimProvider(key);
  await durableStore().uncertain(row);
  const { adapter } = ownerRecovery();
  await adapter.resolve({
    operationId: row.operationId,
    expectedVersion: 2,
    reviewId: randomUUID(),
    decision: "verified",
  });
  const proofRecord = (await durableStore().read(
    key,
    subject,
  )) as FixtureOperation;
  assert.equal(proofRecord.state, "verified");
  await step(
    "accept",
    2,
    { evidence: proofRecord.evidenceId },
    key.operationId,
  );
  await operate("revoke", {}, 3, randomUUID());
  await assert.rejects(durableStore().read(key, subject), /denied/);
});
test("native lost recovery acknowledgement is safely read as the same receipt", async () => {
  await issued();
  const row = await claimProvider();
  await durableStore().uncertain(row);
  let writes = 0;
  const lossy: OnboardingQuery = {
    query: async (sql, values) => {
      const result = await operator.query(sql, values);
      if (sql.includes("resolve_provider_step") && ++writes === 1)
        throw new Error("fictional acknowledgement loss");
      return result;
    },
  };
  const { adapter, state } = ownerRecovery(lossy);
  const command = {
    operationId: row.operationId,
    expectedVersion: 2,
    reviewId: randomUUID(),
    decision: "no-effect",
  };
  await assert.rejects(
    adapter.resolve(command),
    (error: Error) =>
      error instanceof RecoveryError &&
      error.reason === "reconciliation-required",
  );
  assert.deepEqual(await adapter.resolve(command), {
    revision: 3,
    receipt: true,
  });
  assert.equal(writes, 1);
  assert.equal(state.inspections, 1);
  assert.equal(await count("provider_events"), 3);
});
test("owner preparation fails atomically if the expiry audit insert fails", async () => {
  await issued();
  const row = await claimProvider();
  await admin.query(
    "update ggs_onboarding.provider_operations set lease_until=clock_timestamp()-interval '1 second'",
  );
  await admin.query(
    "create function ggs_onboarding.fixture_expiry_fail() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure';end$$;create trigger fixture_expiry_fail before insert on ggs_onboarding.provider_events for each row execute function ggs_onboarding.fixture_expiry_fail()",
  );
  try {
    await assert.rejects(
      ownerRecovery().adapter.prepare({ operationId: row.operationId }),
      /reconciliation-required/,
    );
  } finally {
    await admin.query(
      "drop trigger fixture_expiry_fail on ggs_onboarding.provider_events;drop function ggs_onboarding.fixture_expiry_fail()",
    );
  }
  assert.equal(
    (await admin.query("select state from ggs_onboarding.provider_operations"))
      .rows[0].state,
    "claimed",
  );
  assert.equal(await count("provider_events"), 1);
});
test("owner preparation is denied to all other runtime roles and wrong owner identities", async () => {
  await issued();
  const row = await claimProvider();
  for (const pool of [proof, setup, reader, maintenance, ...deniedPools])
    await assert.rejects(
      pool.query("select ggs_onboarding.prepare_provider_review($1,$2)", [
        owner,
        row.operationId,
      ]),
    );
  await assert.rejects(
    operator.query("select ggs_onboarding.prepare_provider_review($1,$2)", [
      subject,
      row.operationId,
    ]),
  );
  const { adapter, state } = ownerRecovery();
  state.user = null;
  await assert.rejects(
    adapter.prepare({ operationId: row.operationId }),
    /denied/,
  );
});
