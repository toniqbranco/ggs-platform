import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { before, after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { postgres17TestConfig } from "./config";
import { fixtureCertificates, tlsBridge } from "./tls-bridge";
import {
  createIsolatedStorageTransport,
  StorageTransportError,
} from "../../proposals/application-storage/transport";
import {
  createApplicationStorageProposal,
  ApplicationStoreError,
} from "../../proposals/application-storage/adapter";
import {
  approvedFixtureUser,
  fixtureOwnerId,
} from "../fixtures/pilot-admissions";

const config = postgres17TestConfig(process.env);
const suffix = randomBytes(6).toString("hex");
const database = `ggs_pg17_${suffix}`;
const intake = {
  user: `ggs_fixture_intake_${suffix}`,
  password: randomBytes(32).toString("hex"),
};
const review = {
  user: `ggs_fixture_review_${suffix}`,
  password: randomBytes(32).toString("hex"),
};
const groups = [
  "ggs_pilot_data_owner",
  "ggs_pilot_executor",
  "ggs_pilot_intake",
  "ggs_pilot_review",
  "anon",
  "authenticated",
  "service_role",
];
const control = new Pool(config);
const admin = new Pool({ ...config, database });
let certificates: ReturnType<typeof fixtureCertificates>;
let bridge: Awaited<ReturnType<typeof tlsBridge>> | undefined;
let transport: ReturnType<typeof createIsolatedStorageTransport> | undefined;
let databaseCreated = false;
const createdRoles: string[] = [];
let migrationApplied = false;

function input(change: Record<string, unknown> = {}) {
  return {
    appEnv: "test",
    acknowledgement: "disposable-local-postgres17",
    host: "127.0.0.1",
    port: 55438,
    database,
    ca: certificates.ca,
    intake,
    review,
    ...change,
  };
}
const failure = (code: string) => (error: unknown) =>
  error instanceof StorageTransportError &&
  error.code === code &&
  error.message === "Application storage transport unavailable." &&
  !error.cause;
async function start(
  variant: "valid" | "wrong-host" | "expired" | "plaintext" = "valid",
  change: Record<string, unknown> = {},
) {
  await transport?.close();
  transport = undefined;
  await bridge?.close();
  bridge = await tlsBridge(
    variant === "plaintext" ? null : certificates.certificates[variant],
  );
  transport = createIsolatedStorageTransport(input(change));
  return transport;
}
const sample = () => ({
  operationId: randomUUID(),
  name: "TLS Demo",
  email: "tls@example.invalid",
  country: "Colombia",
  platform: "tiktok",
  profile: "https://example.invalid/tls",
  locale: "en",
});
const store = (
  channels: ReturnType<typeof createIsolatedStorageTransport>,
  accepted = true,
) =>
  createApplicationStorageProposal({
    ...channels,
    ownerUserId: fixtureOwnerId,
    verify: async () => ({
      data: { user: accepted ? approvedFixtureUser("owner") : null },
      error: null,
    }),
  });

before(async () => {
  const identity = (
    await control.query(
      "select current_setting('server_version_num')::int version,current_database() database,current_user actor",
    )
  ).rows[0];
  assert.ok(identity.version >= 170000 && identity.version < 180000);
  assert.equal(identity.database, "ggs_pg17_isolated_test");
  assert.equal(identity.actor, "ggs_test_admin");
  assert.equal(
    (
      await control.query(
        "select 1 from pg_roles where rolname=any($1::text[])",
        [groups],
      )
    ).rowCount,
    0,
    "Never adopt pre-existing groups",
  );
  certificates = fixtureCertificates();
  await control.query(`create database ${database}`);
  databaseCreated = true;
  for (const role of ["anon", "authenticated", "service_role"]) {
    await control.query(`create role ${role} nologin`);
    createdRoles.push(role);
  }
  const directory = "proposals/application-storage/supabase/migrations";
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));
  assert.equal(files.length, 1);
  const client = await admin.connect();
  try {
    await client.query("set ggs.reviewed_storage_proposal='testing-only'");
    await client.query(readFileSync(`${directory}/${files[0]}`, "utf8"));
    migrationApplied = true;
  } finally {
    client.release();
  }
  for (const [role, group] of [
    [intake, "ggs_pilot_intake"],
    [review, "ggs_pilot_review"],
  ] as const) {
    await control.query(
      `create role ${role.user} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${role.password}'`,
    );
    createdRoles.push(role.user);
    await control.query(`grant ${group} to ${role.user}`);
  }
  await admin.query(
    "insert into ggs_pilot.review_configuration(owner_auth_id) values($1)",
    [fixtureOwnerId],
  );
});
after(async () => {
  await transport?.close();
  await bridge?.close();
  await admin.end();
  if (databaseCreated) await control.query(`drop database ${database}`);
  for (const role of createdRoles.reverse())
    await control.query(`drop role ${role}`);
  if (migrationApplied)
    for (const role of groups.slice(0, 4))
      await control.query(`drop role ${role}`);
  await control.end();
});

test("configuration denies hosted targets, ambient-only input and role/secret confusion", () => {
  for (const change of [
    { appEnv: "production" },
    { acknowledgement: "" },
    { host: "db.example.invalid" },
    { port: 5432 },
    { database: "postgres" },
    { connectionString: "postgres://example.invalid" },
    { ssl: false },
    { intake: review },
    { review: intake },
    { review: { ...review, password: intake.password } },
    { intake: { ...intake, password: "" } },
  ]) {
    assert.throws(
      () => createIsolatedStorageTransport(input(change)),
      failure("08006"),
    );
  }
  assert.throws(() => createIsolatedStorageTransport({}), failure("08006"));
});
test("real driver uses TLS, distinct restricted logins and explicit startup settings", async () => {
  const channels = await start();
  for (const [kind, channel, expected] of [
    ["intake", channels.intake, intake.user],
    ["review", channels.review, review.user],
  ] as const) {
    const result = await channel.query(
      "select current_user actor,session_user session_actor,current_database() database,current_setting('statement_timeout') statement,current_setting('lock_timeout') lock,current_setting('idle_in_transaction_session_timeout') idle,current_setting('timezone') timezone,current_setting('application_name') name",
      [],
    );
    assert.deepEqual(result.rows[0], {
      actor: expected,
      session_actor: expected,
      database,
      statement: "10s",
      lock: "3s",
      idle: "15s",
      timezone: "UTC",
      name: `ggs_isolated_${kind}`,
    });
    await assert.rejects(
      channel.query("select * from ggs_pilot.applications", []),
      failure("42501"),
    );
    await assert.rejects(
      channel.query("set role ggs_pilot_executor", []),
      failure("42501"),
    );
  }
  assert.ok(bridge!.encryptedConnections() >= 2);
  await assert.rejects(
    channels.intake.query("select * from ggs_pilot.list_applications($1)", [
      fixtureOwnerId,
    ]),
    failure("42501"),
  );
  await assert.rejects(
    channels.review.query(
      "select ggs_pilot.submit_application($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        "No",
        "no@example.invalid",
        "Colombia",
        "tiktok",
        "https://example.invalid/no",
        "en",
      ],
    ),
    failure("42501"),
  );
});
test("adapter submits, reviews and retries through TLS with fresh owner verification", async () => {
  const channels = await start();
  const adapter = store(channels);
  const application = sample();
  await adapter.submit(application);
  await adapter.submit(application);
  const rows = await adapter.list({});
  assert.equal(rows.length, 1);
  const decision = {
    applicationId: rows[0]!.id,
    operationId: randomUUID(),
    expectedRevision: 1,
    decision: "approved",
  };
  await adapter.decide(decision);
  await adapter.decide(decision);
  assert.equal((await adapter.list({}))[0]!.revision, 2);
  await assert.rejects(
    store(channels, false).list({}),
    (error) =>
      error instanceof ApplicationStoreError && error.reason === "denied",
  );
});
test("wrong hostname is rejected by the real pg driver", async () => {
  const channels = await start("wrong-host");
  await assert.rejects(
    channels.intake.query("select 1", []),
    failure("ERR_TLS_CERT_ALTNAME_INVALID"),
  );
});
test("expired certificate is rejected by the real pg driver", async () => {
  const channels = await start("expired");
  await assert.rejects(
    channels.intake.query("select 1", []),
    failure("CERT_HAS_EXPIRED"),
  );
});
test("untrusted certificate chain is rejected by the real pg driver", async () => {
  const channels = await start("valid", {
    ca: certificates.certificates["wrong-host"].cert.toString(),
  });
  await assert.rejects(
    channels.intake.query("select 1", []),
    (error) =>
      failure("UNABLE_TO_VERIFY_LEAF_SIGNATURE")(error) ||
      failure("SELF_SIGNED_CERT_IN_CHAIN")(error),
  );
});
test("a non-TLS server cannot trigger plaintext fallback", async () => {
  const channels = await start("plaintext");
  await assert.rejects(channels.intake.query("select 1", []), failure("08006"));
  assert.equal(bridge!.encryptedConnections(), 0);
});
test("hostile ambient PG variables cannot redirect or weaken the transport", async () => {
  const variables = {
    PGHOST: "example.invalid",
    PGPORT: "1",
    PGDATABASE: "wrong",
    PGUSER: "postgres",
    PGPASSWORD: "wrong",
    PGSSLMODE: "disable",
    PGOPTIONS: "-c statement_timeout=0 -c role=ggs_pilot_executor",
    PGAPPNAME: "wrong",
    PGCLIENT_ENCODING: "SQL_ASCII",
    PGREPLICATION: "database",
    PGSSLNEGOTIATION: "direct",
  };
  const saved = Object.fromEntries(
    Object.keys(variables).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, variables);
    const channels = await start();
    const result = await channels.intake.query(
      "select current_user actor,current_database() database,current_setting('statement_timeout') timeout,current_setting('application_name') name",
      [],
    );
    assert.deepEqual(result.rows[0], {
      actor: intake.user,
      database,
      timeout: "10s",
      name: "ggs_isolated_intake",
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("server cancels a long query, redacts failures and leaves no continuing sleep", async () => {
  const channels = await start();
  await assert.rejects(
    channels.intake.query("select pg_sleep(20)", []),
    failure("57014"),
  );
  const active = await admin.query(
    "select 1 from pg_stat_activity where datname=$1 and application_name='ggs_isolated_intake' and state='active'",
    [database],
  );
  assert.equal(active.rowCount, 0);
  await assert.rejects(
    channels.review.query("select $1::integer", [
      "private-contact@example.invalid",
    ]),
    failure("08006"),
  );
  assert.equal(
    (await channels.review.query("select 1 as value", [])).rows[0]!.value,
    1,
  );
});
test("idle socket failure fails closed; close drains and is idempotent", async () => {
  const channels = await start();
  await channels.intake.query("select 1", []);
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and application_name='ggs_isolated_intake'",
    [database],
  );
  await delay(100);
  await assert.rejects(channels.intake.query("select 1", []), failure("08006"));
  await channels.review.query("select 1", []);
  await Promise.all([channels.close(), channels.close()]);
  await assert.rejects(channels.review.query("select 1", []), failure("08006"));
  assert.equal(
    (
      await admin.query(
        "select 1 from pg_stat_activity where datname=$1 and application_name like 'ggs_isolated_%'",
        [database],
      )
    ).rowCount,
    0,
  );
});

async function waitForIntakeQuery() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await admin.query(
      "select 1 from pg_stat_activity where datname=$1 and application_name='ggs_isolated_intake' and state='active'",
      [database],
    );
    if (result.rowCount === 1) return;
    await delay(10);
  }
  throw new Error("Isolated intake query did not reach the database");
}
test("one-connection pool bounds queued acquisition without starting another query", async () => {
  const channels = await start();
  const first = channels.intake.query("select pg_sleep(7)", []);
  try {
    await waitForIntakeQuery();
    const started = Date.now();
    await assert.rejects(
      channels.intake.query("select 1", []),
      failure("08006"),
    );
    assert.ok(Date.now() - started >= 4500 && Date.now() - started < 6500);
    assert.equal(
      (
        await admin.query(
          "select 1 from pg_stat_activity where datname=$1 and application_name='ggs_isolated_intake'",
          [database],
        )
      ).rowCount,
      1,
    );
  } finally {
    await first;
  }
});
test("close waits for an in-flight query and rejects new work", async () => {
  const channels = await start();
  let completed = false;
  const first = channels.intake.query("select pg_sleep(0.3)", []).then(() => {
    completed = true;
  });
  await waitForIntakeQuery();
  const close = channels.close();
  await assert.rejects(channels.intake.query("select 1", []), failure("08006"));
  await close;
  assert.equal(completed, true);
  await first;
});
