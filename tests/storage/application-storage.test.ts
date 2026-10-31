import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  createApplicationStorageProposal,
  ApplicationStoreError,
  type ProposalQuery,
} from "../../proposals/application-storage/adapter";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";

const db = new PGlite();
const directory = "proposals/application-storage/supabase/migrations";
const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));
assert.equal(files.length, 1);
const migration = readFileSync(`${directory}/${files[0]}`, "utf8");
let user: ReturnType<typeof approvedFixtureUser> | null;
let verificationCalls = 0;
function database(
  role:
    | "ggs_pilot_intake"
    | "ggs_pilot_review"
    | "anon"
    | "authenticated"
    | "service_role"
    | "ggs_pilot_data_owner",
): ProposalQuery {
  return {
    query: (sql, values) =>
      db
        .transaction(async (tx) => {
          // Model a real restricted connection, not a superuser temporarily SET ROLE.
          // SET ROLE alone leaves session_user=postgres and permits false escalation.
          await tx.exec(`set local session authorization ${role}`);
          return tx.query<Record<string, unknown>>(sql, values);
        })
        .finally(async () => {
          await db.exec("set session authorization postgres; reset role");
        }),
  };
}
const intake = database("ggs_pilot_intake");
const review = database("ggs_pilot_review");
const store = createApplicationStorageProposal({
  intake,
  review,
  ownerUserId: fixtureOwnerId,
  verify: async () => {
    verificationCalls++;
    return { data: { user }, error: null };
  },
});
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
const rows = async (table: string) =>
  (await db.query<Record<string, unknown>>(`select * from ggs_pilot.${table}`))
    .rows;
const failure = (reason: string) => (error: unknown) =>
  error instanceof ApplicationStoreError && error.reason === reason;
before(async () => {
  await assert.rejects(db.exec(migration), /Unapproved storage proposal/);
  await db.exec("rollback");
  assert.equal(
    (await db.query("select 1 from pg_namespace where nspname='ggs_pilot'"))
      .rows.length,
    0,
  );
  await db.exec(
    "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; alter default privileges grant all on tables to public,anon,authenticated,service_role; alter default privileges grant execute on functions to anon,authenticated,service_role;",
  );
  await db.exec("set ggs.reviewed_storage_proposal='testing-only'");
  await db.exec(migration);
});
beforeEach(async () => {
  await db.exec(
    "truncate ggs_pilot.application_events,ggs_pilot.application_operations,ggs_pilot.applications; delete from ggs_pilot.review_configuration;",
  );
  await db.query(
    "insert into ggs_pilot.review_configuration(owner_auth_id) values($1)",
    [fixtureOwnerId],
  );
  user = approvedFixtureUser("owner");
  verificationCalls = 0;
});
after(async () => db.close());

test("migration creates only private tables with FORCE RLS and non-login non-bypass roles", async () => {
  const tables = await db.query<{
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ggs_pilot' and relkind='r'",
  );
  assert.equal(tables.rows.length, 4);
  assert.ok(
    tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity),
  );
  const roles = await db.query<{
    rolcanlogin: boolean;
    rolbypassrls: boolean;
    rolsuper: boolean;
  }>(
    "select rolcanlogin,rolbypassrls,rolsuper from pg_roles where rolname like 'ggs_pilot_%'",
  );
  assert.equal(roles.rows.length, 4);
  assert.ok(
    roles.rows.every(
      (row) => !row.rolcanlogin && !row.rolbypassrls && !row.rolsuper,
    ),
  );
});
test("missing owner configuration denies intake before any application or receipt", async () => {
  await db.exec("delete from ggs_pilot.review_configuration");
  await assert.rejects(store.submit(input()), failure("unavailable"));
  assert.equal((await rows("applications")).length, 0);
  assert.equal((await rows("application_operations")).length, 0);
});
test("new intake, duplicate contact and exact retry have the same receipt and never overwrite", async () => {
  const original = input();
  assert.deepEqual(await store.submit(original), { received: true });
  assert.deepEqual(await store.submit(original), { received: true });
  assert.deepEqual(
    await store.submit(
      input({ email: "CREATOR@example.invalid", name: "Do not overwrite" }),
    ),
    { received: true },
  );
  assert.equal((await rows("applications")).length, 1);
  assert.equal((await rows("applications"))[0]?.creator_name, "Creator Demo");
  assert.equal((await rows("application_operations")).length, 2);
  assert.equal((await rows("application_events")).length, 1);
});
test("changed retry payload is refused, including duplicate-contact receipt replay", async () => {
  const original = input();
  await store.submit(original);
  await assert.rejects(
    store.submit({ ...original, email: "different@example.invalid" }),
    failure("conflict"),
  );
  const duplicate = input();
  await store.submit(duplicate);
  await assert.rejects(
    store.submit({ ...duplicate, name: "Different Demo" }),
    failure("conflict"),
  );
  assert.equal((await rows("applications")).length, 1);
});
test("approval and rejection are transactional terminal decisions, never account grants", async () => {
  for (const decision of ["approved", "rejected"] as const) {
    await store.submit(input({ email: `${decision}@example.invalid` }));
    const application = (await store.list()).find((record) =>
      record.email.startsWith(decision),
    )!;
    const operation = {
      applicationId: application.id,
      operationId: randomUUID(),
      expectedRevision: 1,
      decision,
    };
    assert.deepEqual(await store.decide(operation), { revision: 2 });
    assert.deepEqual(await store.decide(operation), { revision: 2 });
    await assert.rejects(
      store.decide({ ...operation, operationId: randomUUID() }),
      failure("conflict"),
    );
    assert.deepEqual(
      (await store.history({ applicationId: application.id })).map((event) => [
        event.kind,
        event.revision,
      ]),
      [
        ["submitted", 1],
        [decision, 2],
      ],
    );
  }
  const schemas = await db.query(
    "select 1 from pg_namespace where nspname='auth'",
  );
  assert.equal(
    schemas.rows.length,
    0,
    "Migration does not create or depend on managed Auth tables",
  );
});
test("a stale revision rolls back its receipt and decision", async () => {
  await store.submit(input());
  const [application] = await store.list();
  await assert.rejects(
    store.decide({
      applicationId: application!.id,
      operationId: randomUUID(),
      expectedRevision: 2,
      decision: "approved",
    }),
    failure("conflict"),
  );
  assert.equal((await rows("application_operations")).length, 1);
  assert.equal((await rows("applications"))[0]?.review_state, "pending");
});
test("audit failure rolls back the application decision and operation", async () => {
  await store.submit(input());
  const [application] = await store.list();
  await db.exec(
    "create function ggs_pilot.test_reject_event() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$; create trigger test_audit_failure before insert on ggs_pilot.application_events for each row execute function ggs_pilot.test_reject_event();",
  );
  try {
    await assert.rejects(
      store.decide({
        applicationId: application!.id,
        operationId: randomUUID(),
        expectedRevision: 1,
        decision: "approved",
      }),
      failure("unavailable"),
    );
    assert.equal((await rows("applications"))[0]?.review_state, "pending");
    assert.equal((await rows("application_operations")).length, 1);
    assert.equal((await rows("application_events")).length, 1);
  } finally {
    await db.exec(
      "drop trigger test_audit_failure on ggs_pilot.application_events; drop function ggs_pilot.test_reject_event();",
    );
  }
});
test("intake and review entry roles cannot directly read/write tables, alter configuration or escalate", async () => {
  for (const channel of [intake, review]) {
    for (const sql of [
      "select * from ggs_pilot.applications",
      "select * from ggs_pilot.application_events",
      "update ggs_pilot.application_events set revision=2",
      "delete from ggs_pilot.application_events",
      "update ggs_pilot.review_configuration set version=1",
      "set role ggs_pilot_executor",
      "create table ggs_pilot.injection(id integer)",
    ])
      await assert.rejects(channel.query(sql, []));
  }
  await assert.rejects(
    intake.query("select * from ggs_pilot.list_applications($1)", [
      fixtureOwnerId,
    ]),
  );
  await assert.rejects(
    review.query("select ggs_pilot.submit_application($1,$2,$3,$4,$5,$6,$7)", [
      randomUUID(),
      "Creator Demo",
      "demo@example.invalid",
      "Colombia",
      "tiktok",
      "https://example.invalid/demo",
      "es",
    ]),
  );
});
test("explicit broad default ACLs are revoked for general Supabase API roles", async () => {
  await store.submit(input());
  for (const role of ["anon", "authenticated", "service_role"] as const) {
    const channel = database(role);
    await assert.rejects(
      channel.query("select * from ggs_pilot.applications", []),
    );
    await assert.rejects(
      channel.query("select * from ggs_pilot.list_applications($1)", [
        fixtureOwnerId,
      ]),
    );
  }
  assert.deepEqual(
    (
      await database("ggs_pilot_data_owner").query(
        "select * from ggs_pilot.applications",
        [],
      )
    ).rows,
    [],
  );
});
test("database owner parameter must match configuration; client actor injection is rejected", async () => {
  await assert.rejects(
    review.query("select * from ggs_pilot.list_applications($1)", [
      randomUUID(),
    ]),
  );
  await assert.rejects(
    store.decide({
      actor: fixtureOwnerId,
      applicationId: randomUUID(),
      operationId: randomUUID(),
      expectedRevision: 1,
      decision: "approved",
    }),
    failure("invalid"),
  );
});
test("fresh server verification denies anonymous, admin, streamer, forged and suspended owners", async () => {
  for (const identity of [
    null,
    approvedFixtureUser("admin"),
    approvedFixtureUser("streamer"),
  ]) {
    user = identity;
    await assert.rejects(store.list(), failure("denied"));
  }
  user = approvedFixtureUser("owner");
  await store.list();
  user.app_metadata.ggs_pilot.membership = "suspended";
  await assert.rejects(store.list(), failure("denied"));
  assert.equal(verificationCalls, 5);
});
test("bounded cursor reads omit internal contact keys, receipt fingerprints and actor IDs", async () => {
  await store.submit(input());
  await store.submit(input({ email: "second@example.invalid" }));
  const [first] = await store.list({ limit: 1 });
  const second = await store.list({
    after: { createdAt: first!.createdAt, id: first!.id },
    limit: 1,
  });
  assert.equal(second.length, 1);
  assert.notEqual(second[0]?.id, first!.id);
  assert.equal(Object.hasOwn(first!, "contact_key"), false);
  assert.equal(Object.hasOwn(first!, "decided_by"), false);
  const [event] = await store.history({ applicationId: first!.id });
  assert.equal(Object.hasOwn(event!, "actor_auth_id"), false);
  await assert.rejects(store.list({ limit: 51 }), failure("invalid"));
});
test("parameterized input cannot execute SQL and invalid fields fail before storage", async () => {
  await store.submit(input({ name: "Demo'); drop schema ggs_pilot; --" }));
  assert.equal((await rows("applications")).length, 1);
  for (const change of [
    { roles: ["owner"] },
    { profile: "javascript:alert(1)" },
    { email: "invalid" },
  ])
    await assert.rejects(store.submit(input(change)), failure("invalid"));
  assert.equal((await rows("applications")).length, 1);
});
test("database constraints also reject direct routine calls with invalid payloads", async () => {
  await assert.rejects(
    intake.query("select ggs_pilot.submit_application($1,$2,$3,$4,$5,$6,$7)", [
      randomUUID(),
      "Creator Demo",
      "bad",
      "Colombia",
      "tiktok",
      "https://example.invalid/demo",
      "es",
    ]),
  );
  assert.equal((await rows("applications")).length, 0);
  assert.equal((await rows("application_operations")).length, 0);
});
test("provider and database exceptions return only controlled errors", async () => {
  const broken = createApplicationStorageProposal({
    ownerUserId: fixtureOwnerId,
    verify: async () => {
      throw new Error("private-provider-detail");
    },
    intake: {
      query: async () => {
        throw new Error("private-db-detail");
      },
    },
    review,
  });
  await assert.rejects(
    broken.list(),
    (error: unknown) =>
      failure("denied")(error) &&
      !String(error).includes("private-provider-detail"),
  );
  await assert.rejects(
    broken.submit(input()),
    (error: unknown) =>
      failure("unavailable")(error) &&
      !String(error).includes("private-db-detail"),
  );
});
