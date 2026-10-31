import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
import { postgres17TestConfig } from "./config";
import {
  createApplicationStorageProposal,
  ApplicationStoreError,
  type ProposalQuery,
} from "../../proposals/application-storage/adapter";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";

const config = postgres17TestConfig(process.env);
const suffix = randomBytes(6).toString("hex");
const databaseName = `ggs_pg17_${suffix}`;
const directory = "proposals/application-storage/supabase/migrations";
const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));
assert.equal(files.length, 1);
const migration = readFileSync(`${directory}/${files[0]}`, "utf8");
const control = new Pool({
  ...config,
  application_name: `ggs_fixture_control_${suffix}`,
});
const admin = new Pool({
  ...config,
  database: databaseName,
  application_name: `ggs_fixture_admin_${suffix}`,
});
const groups = [
  "ggs_pilot_data_owner",
  "ggs_pilot_executor",
  "ggs_pilot_intake",
  "ggs_pilot_review",
  "anon",
  "authenticated",
  "service_role",
];
const runtimes = new Map<string, Pool>();
const createdLogins: string[] = [];
const unexpectedPoolErrors: string[] = [];
let createdDatabase = false;
let migrationApplied = false;
let user: ReturnType<typeof approvedFixtureUser> | null;
let intake: Pool;
let review: Pool;
let anonymous: Pool;
let migrator: Pool;
let migratorName: string;

const input = (change: Record<string, unknown> = {}) => ({
  operationId: randomUUID(),
  name: "Creator Demo",
  email: "creator@example.invalid",
  country: "Colombia",
  platform: "tiktok",
  profile: "https://example.invalid/creator",
  locale: "es",
  ...change,
});
function store(
  channels: { intake?: ProposalQuery; review?: ProposalQuery } = {},
) {
  return createApplicationStorageProposal({
    intake: channels.intake ?? intake,
    review: channels.review ?? review,
    ownerUserId: fixtureOwnerId,
    verify: async () => ({ data: { user }, error: null }),
  });
}
const isFailure = (reason: string) => (error: unknown) =>
  error instanceof ApplicationStoreError && error.reason === reason;
async function login(label: string, group: string) {
  const name = `ggs_fixture_${label}_${suffix}`;
  const password = randomBytes(32).toString("hex");
  // Identifiers and password are generated fixtures, never request input.
  await control.query(
    `create role ${name} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}'`,
  );
  createdLogins.push(name);
  await control.query(`grant ${group} to ${name}`);
  const pool = new Pool({
    ...config,
    database: databaseName,
    user: name,
    password,
    application_name: `ggs_fixture_${label}_${suffix}`,
  });
  pool.on("error", (error) => unexpectedPoolErrors.push(error.message));
  runtimes.set(label, pool);
  return pool;
}
async function counts() {
  const result = await admin.query<{
    applications: number;
    operations: number;
    events: number;
  }>(
    "select (select count(*)::int from ggs_pilot.applications) applications,(select count(*)::int from ggs_pilot.application_operations) operations,(select count(*)::int from ggs_pilot.application_events) events",
  );
  return result.rows[0]!;
}
async function waitForLocks(names: string[], minimum: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await admin.query<{ pid: number }>(
      "select pid from pg_stat_activity where datname=$1 and application_name=any($2::text[]) and wait_event_type='Lock' and state='active'",
      [databaseName, names],
    );
    if (result.rows.length >= minimum) return result.rows.map((row) => row.pid);
    await delay(25);
  }
  throw new Error(
    "Expected independent fixture transactions did not reach the lock barrier",
  );
}
async function race(
  lock: (client: PoolClient) => Promise<unknown>,
  names: string[],
  actions: (() => Promise<unknown>)[],
) {
  const blocker = await admin.connect();
  await blocker.query("begin");
  let results: Promise<PromiseSettledResult<unknown>[]> | undefined;
  let barrierError: unknown;
  try {
    await lock(blocker);
    results = Promise.allSettled(actions.map((action) => action()));
    const pids = await waitForLocks(names, 2);
    assert.ok(
      new Set(pids).size >= 2,
      "At least two server backends must overlap",
    );
  } catch (error) {
    barrierError = error;
  } finally {
    await blocker.query("rollback");
    blocker.release();
  }
  const settled = await results;
  if (barrierError) throw barrierError;
  return settled!;
}

before(async () => {
  const identity = await control.query<{
    version: number;
    database: string;
    actor: string;
  }>(
    "select current_setting('server_version_num')::int version,current_database() database,current_user actor",
  );
  assert.ok(
    identity.rows[0]!.version >= 170000 && identity.rows[0]!.version < 180000,
    "Require a real PostgreSQL 17 server",
  );
  assert.equal(identity.rows[0]!.database, "ggs_pg17_isolated_test");
  assert.equal(identity.rows[0]!.actor, "ggs_test_admin");
  assert.equal(
    (
      await control.query(
        "select 1 from pg_roles where rolname=any($1::text[])",
        [groups],
      )
    ).rowCount,
    0,
    "Never adopt pre-existing application/test roles",
  );
  await control.query(`create database ${databaseName}`);
  createdDatabase = true;
  // Simulate broad existing Supabase API defaults, then require explicit cleanup.
  await control.query(
    "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls",
  );
  migratorName = `ggs_fixture_migrator_${suffix}`;
  const migratorPassword = randomBytes(32).toString("hex");
  await control.query(
    `create role ${migratorName} login nosuperuser createrole createdb noreplication bypassrls password '${migratorPassword}'`,
  );
  createdLogins.push(migratorName);
  await admin.query(
    `grant create on database ${databaseName} to ${migratorName}`,
  );
  migrator = new Pool({
    ...config,
    database: databaseName,
    user: migratorName,
    password: migratorPassword,
    max: 1,
    application_name: `ggs_fixture_migrator_${suffix}`,
  });
  migrator.on("error", (error) => unexpectedPoolErrors.push(error.message));
  runtimes.set("migrator", migrator);
  await admin.query(
    `alter default privileges for role ${migratorName} grant all on tables to public,anon,authenticated,service_role; alter default privileges for role ${migratorName} grant execute on functions to anon,authenticated,service_role`,
  );
  const setup = await migrator.connect();
  try {
    await assert.rejects(setup.query(migration), /Unapproved storage proposal/);
    await setup.query("rollback");
    assert.equal(
      (
        await setup.query(
          "select 1 from pg_namespace where nspname='ggs_pilot'",
        )
      ).rowCount,
      0,
    );
    await setup.query("set ggs.reviewed_storage_proposal='testing-only'");
    await setup.query(migration);
    migrationApplied = true;
  } finally {
    setup.release();
  }
  intake = await login("intake", "ggs_pilot_intake");
  review = await login("review", "ggs_pilot_review");
  anonymous = await login("anonymous", "anon");
});
beforeEach(async () => {
  await admin.query(
    "truncate ggs_pilot.application_events,ggs_pilot.application_operations,ggs_pilot.applications; delete from ggs_pilot.review_configuration",
  );
  await admin.query(
    "insert into ggs_pilot.review_configuration(owner_auth_id) values($1)",
    [fixtureOwnerId],
  );
  user = approvedFixtureUser("owner");
});
after(async () => {
  await Promise.all([...runtimes.values()].map((pool) => pool.end()));
  await admin.end();
  if (createdDatabase) {
    assert.match(databaseName, /^ggs_pg17_[a-f0-9]{12}$/);
    await control.query(`drop database ${databaseName}`);
    for (const name of createdLogins) await control.query(`drop role ${name}`);
    for (const group of migrationApplied
      ? groups
      : ["anon", "authenticated", "service_role"])
      await control.query(`drop role if exists ${group}`);
  }
  await control.end();
  assert.deepEqual(unexpectedPoolErrors, [], "No unexpected idle-pool errors");
});

test("managed-style non-superuser migration restores temporary ownership access", async () => {
  const profile = await migrator.query<{
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolbypassrls: boolean;
    self_grant: string;
  }>(
    "select rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,current_setting('createrole_self_grant') self_grant from pg_roles where rolname=current_user",
  );
  assert.deepEqual(profile.rows[0], {
    rolsuper: false,
    rolcreaterole: true,
    rolcreatedb: true,
    rolbypassrls: true,
    self_grant: "",
  });
  for (const role of ["ggs_pilot_data_owner", "ggs_pilot_executor"]) {
    const effective = await migrator.query<{
      inherited: boolean;
      can_set: boolean;
    }>(
      "select pg_has_role(current_user,$1,'USAGE') inherited,pg_has_role(current_user,$1,'SET') can_set",
      [role],
    );
    assert.deepEqual(effective.rows[0], { inherited: false, can_set: false });
  }
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from pg_auth_members m join pg_roles r on r.oid=m.grantor where r.rolname=$1",
        [migratorName],
      )
    ).rows[0].n,
    0,
    "No explicit migrator-granted membership survives setup",
  );
  await assert.rejects(migrator.query("select * from ggs_pilot.applications"));
});
test("real restricted logins have no superuser, role-management or table-edit authority", async () => {
  for (const pool of [intake, review, anonymous]) {
    const identity = await pool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
    }>(
      "select rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname=current_user",
    );
    assert.deepEqual(identity.rows[0], {
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
    });
    for (const sql of [
      "select * from ggs_pilot.applications",
      "update ggs_pilot.application_events set revision=2",
      "delete from ggs_pilot.application_events",
      "update ggs_pilot.review_configuration set version=1",
      "set role ggs_pilot_executor",
      "create table ggs_pilot.unsafe(id integer)",
    ])
      await assert.rejects(pool.query(sql));
  }
  await assert.rejects(
    anonymous.query("select * from ggs_pilot.list_applications($1)", [
      fixtureOwnerId,
    ]),
  );
  await assert.rejects(
    intake.query("select * from ggs_pilot.list_applications($1)", [
      fixtureOwnerId,
    ]),
  );
});
test("simultaneous contact duplicates preserve one application and one submitted event", async () => {
  const actions = Array.from(
    { length: 8 },
    (_, index) => () =>
      store().submit(input({ name: `Creator Demo ${index}` })),
  );
  const results = await race(
    (client) =>
      client.query(
        "lock table ggs_pilot.applications in share row exclusive mode",
      ),
    [`ggs_fixture_intake_${suffix}`],
    actions,
  );
  assert.ok(
    results.every(
      (result) =>
        result.status === "fulfilled" &&
        JSON.stringify(result.value) === '{"received":true}',
    ),
  );
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 8,
    events: 1,
  });
});
test("simultaneous identical submission operations produce one durable receipt", async () => {
  const value = input();
  const results = await race(
    (client) =>
      client.query(
        "lock table ggs_pilot.applications in share row exclusive mode",
      ),
    [`ggs_fixture_intake_${suffix}`],
    Array.from({ length: 4 }, () => () => store().submit(value)),
  );
  assert.ok(results.every((result) => result.status === "fulfilled"));
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 1,
    events: 1,
  });
});
test("simultaneous changed-payload operation reuse has one winner and one conflict", async () => {
  const value = input();
  const results = await race(
    (client) =>
      client.query(
        "lock table ggs_pilot.applications in share row exclusive mode",
      ),
    [`ggs_fixture_intake_${suffix}`],
    [
      () => store().submit(value),
      () => store().submit({ ...value, name: "Different Demo" }),
    ],
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.ok(
    results.some(
      (result) =>
        result.status === "rejected" && isFailure("conflict")(result.reason),
    ),
  );
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 1,
    events: 1,
  });
});
test("competing owner decisions lock the same row and only one terminal decision commits", async () => {
  await store().submit(input());
  const [application] = await store().list();
  const decide = (decision: "approved" | "rejected") =>
    store().decide({
      applicationId: application!.id,
      operationId: randomUUID(),
      expectedRevision: 1,
      decision,
    });
  const results = await race(
    (client) =>
      client.query(
        "select id from ggs_pilot.applications where id=$1 for update",
        [application!.id],
      ),
    [`ggs_fixture_review_${suffix}`],
    [() => decide("approved"), () => decide("rejected")],
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.ok(
    results.some(
      (result) =>
        result.status === "rejected" && isFailure("conflict")(result.reason),
    ),
  );
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 2,
    events: 2,
  });
  const history = await store().history({ applicationId: application!.id });
  assert.deepEqual(
    history.map((event) => event.revision),
    [1, 2],
  );
});
test("simultaneous identical decision retries all return the same committed revision", async () => {
  await store().submit(input());
  const [application] = await store().list();
  const value = {
    applicationId: application!.id,
    operationId: randomUUID(),
    expectedRevision: 1,
    decision: "approved",
  };
  const results = await race(
    (client) =>
      client.query(
        "select id from ggs_pilot.applications where id=$1 for update",
        [application!.id],
      ),
    [`ggs_fixture_review_${suffix}`],
    Array.from({ length: 4 }, () => () => store().decide(value)),
  );
  assert.ok(
    results.every(
      (result) =>
        result.status === "fulfilled" &&
        JSON.stringify(result.value) === '{"revision":2}',
    ),
  );
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 2,
    events: 2,
  });
});
test("a dropped acknowledgement after commit is safely retried for intake and decisions", async () => {
  const lostAcknowledgement = (pool: Pool): ProposalQuery => ({
    query: async (sql, values) => {
      await pool.query(sql, values);
      throw new Error("Synthetic lost acknowledgement after commit");
    },
  });
  const submission = input();
  await assert.rejects(
    store({ intake: lostAcknowledgement(intake) }).submit(submission),
    isFailure("unavailable"),
  );
  assert.deepEqual(await store().submit(submission), { received: true });
  const [application] = await store().list();
  const decision = {
    applicationId: application!.id,
    operationId: randomUUID(),
    expectedRevision: 1,
    decision: "approved",
  };
  await assert.rejects(
    store({ review: lostAcknowledgement(review) }).decide(decision),
    isFailure("unavailable"),
  );
  assert.deepEqual(await store().decide(decision), { revision: 2 });
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 2,
    events: 2,
  });
});
test("terminating a blocked fixture backend rolls back intake and a new connection can retry", async () => {
  const client = await intake.connect();
  client.on("error", () => {
    /* Explicitly expected termination of this backend. */
  });
  const pid = (
    await client.query<{ pid: number }>("select pg_backend_pid() pid")
  ).rows[0]!.pid;
  const blocker = await admin.connect();
  await blocker.query("begin");
  const value = input();
  let pending: PromiseSettledResult<unknown>[] | undefined;
  try {
    await blocker.query(
      "lock table ggs_pilot.applications in share row exclusive mode",
    );
    const operation = Promise.allSettled([
      store({ intake: client }).submit(value),
    ]);
    await waitForLocks([`ggs_fixture_intake_${suffix}`], 1);
    await admin.query("select pg_terminate_backend($1)", [pid]);
    pending = await operation;
  } finally {
    await blocker.query("rollback");
    blocker.release();
    client.release(true);
  }
  assert.ok(
    pending?.[0]?.status === "rejected" &&
      isFailure("unavailable")(pending[0].reason),
  );
  assert.deepEqual(await counts(), {
    applications: 0,
    operations: 0,
    events: 0,
  });
  assert.deepEqual(await store().submit(value), { received: true });
  assert.deepEqual(await counts(), {
    applications: 1,
    operations: 1,
    events: 1,
  });
});
test("other connections cannot read an uncommitted decision or its audit event", async () => {
  await store().submit(input());
  const [application] = await store().list();
  const client = await review.connect();
  await client.query("begin");
  try {
    await store({ review: client }).decide({
      applicationId: application!.id,
      operationId: randomUUID(),
      expectedRevision: 1,
      decision: "approved",
    });
    assert.equal((await store().list())[0]!.state, "pending");
    assert.equal(
      (await store().history({ applicationId: application!.id })).length,
      1,
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  assert.equal((await store().list())[0]!.state, "approved");
  assert.equal(
    (await store().history({ applicationId: application!.id })).length,
    2,
  );
});
test("PostgreSQL 17 audit failure rolls back both intake and owner decisions", async () => {
  const attach = () =>
    admin.query(
      "create function ggs_pilot.fixture_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'fixture audit unavailable'; end $$; create trigger fixture_audit_failure before insert on ggs_pilot.application_events for each row execute function ggs_pilot.fixture_audit_failure()",
    );
  const detach = () =>
    admin.query(
      "drop trigger if exists fixture_audit_failure on ggs_pilot.application_events; drop function if exists ggs_pilot.fixture_audit_failure()",
    );
  await attach();
  try {
    await assert.rejects(store().submit(input()), isFailure("unavailable"));
    assert.deepEqual(await counts(), {
      applications: 0,
      operations: 0,
      events: 0,
    });
  } finally {
    await detach();
  }
  await store().submit(input());
  const [application] = await store().list();
  await attach();
  try {
    await assert.rejects(
      store().decide({
        applicationId: application!.id,
        operationId: randomUUID(),
        expectedRevision: 1,
        decision: "approved",
      }),
      isFailure("unavailable"),
    );
    assert.equal((await store().list())[0]!.state, "pending");
    assert.deepEqual(await counts(), {
      applications: 1,
      operations: 1,
      events: 1,
    });
  } finally {
    await detach();
  }
});
test("fresh revocation and wrong-owner attempts do not leak authority through a reused connection", async () => {
  const client = await review.connect();
  try {
    const identity = await client.query<{
      actor: string;
      session: string;
      pid: number;
    }>("select current_user actor,session_user session,pg_backend_pid() pid");
    assert.equal(identity.rows[0]!.actor, identity.rows[0]!.session);
    await assert.rejects(
      client.query("select * from ggs_pilot.list_applications($1)", [
        randomUUID(),
      ]),
    );
    await store({ review: client }).list();
    user!.app_metadata.ggs_pilot.membership = "suspended";
    await assert.rejects(store({ review: client }).list(), isFailure("denied"));
    user = approvedFixtureUser("streamer");
    await assert.rejects(store({ review: client }).list(), isFailure("denied"));
    user = approvedFixtureUser("owner");
    await store({ review: client }).list();
    const after = await client.query<{
      actor: string;
      session: string;
      pid: number;
    }>("select current_user actor,session_user session,pg_backend_pid() pid");
    assert.deepEqual(after.rows[0], identity.rows[0]);
  } finally {
    client.release();
  }
});
