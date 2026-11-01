import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { postgres17TestConfig } from "./config";
import {
  operatorProject,
  prepareOperatorSql,
  operatorTransitionSql,
  operatorTerminationSql,
  operatorFactsSql,
  assertOperatorFacts,
} from "../../proposals/application-storage/operator-adapter";
const config = postgres17TestConfig(process.env);
const database = `ggs_pg17_${randomBytes(6).toString("hex")}`;
const control = new Pool(config);
const admin = new Pool({ ...config, database });
const operatorName = `ggs_operator_admin_${randomBytes(6).toString("hex")}`;
const operatorPassword = randomBytes(32).toString("hex");
const operator = new Pool({
  ...config,
  database,
  user: operatorName,
  password: operatorPassword,
});
const roles = ["ggs_pilot_intake_login", "ggs_pilot_review_login"];
const groups = [
  "ggs_pilot_data_owner",
  "ggs_pilot_executor",
  "ggs_pilot_intake",
  "ggs_pilot_review",
  "anon",
  "authenticated",
  "service_role",
];
const bundle = {
  version: 1,
  projectId: operatorProject,
  intake: {
    user: `${roles[0]}.${operatorProject}`,
    password: randomBytes(32).toString("hex"),
  },
  review: {
    user: `${roles[1]}.${operatorProject}`,
    password: randomBytes(32).toString("hex"),
  },
};
const pools: Pool[] = [];
let created = false;
let applied = false;
let operatorCreated = false;
let operation: string;
before(async () => {
  const identity = (
    await control.query(
      "select current_user actor,current_database() database,current_setting('server_version_num')::int version",
    )
  ).rows[0];
  assert.equal(identity.actor, "ggs_test_admin");
  assert.equal(identity.database, "ggs_pg17_isolated_test");
  assert.ok(identity.version >= 170000 && identity.version < 180000);
  assert.equal(
    (
      await control.query(
        "select 1 from pg_roles where rolname=any($1::text[])",
        [[...roles, ...groups]],
      )
    ).rowCount,
    0,
  );
  await control.query(`create database ${database}`);
  created = true;
  await control.query(
    "create role anon nologin;create role authenticated nologin;create role service_role nologin",
  );
  const directory = "proposals/application-storage/supabase/migrations";
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));
  assert.equal(files.length, 1);
  const client = await admin.connect();
  try {
    await client.query("set ggs.reviewed_storage_proposal='testing-only'");
    await client.query(readFileSync(`${directory}/${files[0]}`, "utf8"));
    applied = true;
  } finally {
    client.release();
  }
  await control.query(
    `create role ${operatorName} login nosuperuser createrole createdb noreplication bypassrls password '${operatorPassword}'`,
  );
  operatorCreated = true;
  await control.query(
    `grant ggs_pilot_intake,ggs_pilot_review to ${operatorName} with admin true,inherit false,set false`,
  );
  // The hosted postgres role already has this existing administrator capability.
  // It is never granted to either application login.
  await control.query(`grant pg_signal_backend to ${operatorName}`);
});
beforeEach(async () => {
  operation = randomUUID();
  await operator.query(prepareOperatorSql(operation, bundle));
});
afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
  for (const role of roles) await control.query(`drop role if exists ${role}`);
});
after(async () => {
  await operator.end();
  await admin.end();
  if (created) await control.query(`drop database ${database}`);
  if (applied)
    for (const role of groups)
      await control.query(`drop role if exists ${role}`);
  if (operatorCreated) await control.query(`drop role ${operatorName}`);
  await control.end();
});
function login(index: number) {
  const pool = new Pool({
    ...config,
    database,
    user: roles[index]!,
    password: index === 0 ? bundle.intake.password : bundle.review.password,
    max: 1,
  });
  pool.on("error", () => {});
  pools.push(pool);
  return pool;
}
test("generated SCRAM-verifier roles start disabled with exact restricted facts", async () => {
  assertOperatorFacts(
    (await admin.query(operatorFactsSql)).rows,
    operation,
    false,
  );
  await assert.rejects(
    login(0).query("select 1"),
    (error) =>
      !!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "28000",
  );
});
test("enabling permits actual SCRAM authentication but no private direct table access", async () => {
  await operator.query(operatorTransitionSql(operation, true));
  assertOperatorFacts(
    (await admin.query(operatorFactsSql)).rows,
    operation,
    true,
  );
  for (let index = 0; index < 2; index++) {
    const pool = login(index);
    assert.equal(
      (await pool.query("select current_user actor")).rows[0].actor,
      roles[index],
    );
    await assert.rejects(
      pool.query("select * from ggs_pilot.applications"),
      (error) =>
        !!error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "42501",
    );
  }
});
test("operation-marker mismatch aborts enable and recovery atomically", async () => {
  for (const enable of [true, false])
    await assert.rejects(
      operator.query(operatorTransitionSql(randomUUID(), enable)),
      /operator_marker_conflict/,
    );
  assertOperatorFacts(
    (await admin.query(operatorFactsSql)).rows,
    operation,
    false,
  );
});
test("unexpected extra membership prevents atomic enable", async () => {
  await control.query(`grant ggs_pilot_review to ${roles[0]}`);
  await assert.rejects(
    operator.query(operatorTransitionSql(operation, true)),
    /operator_membership_conflict/,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from pg_roles where rolname=any($1::text[]) and rolcanlogin",
        [roles],
      )
    ).rows[0].n,
    0,
  );
});
test("recovery disables future logins while existing sessions require explicit termination", async () => {
  await operator.query(operatorTransitionSql(operation, true));
  const pool = login(0);
  await pool.query("select 1");
  await operator.query(operatorTransitionSql(operation, false));
  assertOperatorFacts(
    (await admin.query(operatorFactsSql)).rows,
    operation,
    false,
    "revoked",
  );
  assert.equal((await pool.query("select 1 value")).rows[0].value, 1);
  await operator.query(operatorTerminationSql(operation));
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from pg_stat_activity where usename=any($1::text[])",
        [roles],
      )
    ).rows[0].n,
    0,
  );
});

test("serialized revocation prevents a delayed enable from reviving logins", async () => {
  const blocker = await admin.connect();
  await blocker.query("begin");
  await blocker.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `ggs-testing-handoff:${operation}`,
  ]);
  const wait = async (count: number) => {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const row = (
        await admin.query(
          "select count(*)::int n from pg_stat_activity where datname=$1 and usename=$2 and wait_event_type='Lock'",
          [database, operatorName],
        )
      ).rows[0];
      if (row.n >= count) return;
      await delay(10);
    }
    throw new Error("Operator lock barrier was not reached");
  };
  const disabling = operator
    .query(operatorTransitionSql(operation, false))
    .then(
      () => true,
      () => false,
    );
  let enabling: Promise<boolean> | undefined;
  try {
    await wait(1);
    enabling = operator.query(operatorTransitionSql(operation, true)).then(
      () => true,
      () => false,
    );
    await wait(2);
    await blocker.query("commit");
    assert.equal(await disabling, true);
    assert.equal(await enabling, false);
    assertOperatorFacts(
      (await admin.query(operatorFactsSql)).rows,
      operation,
      false,
      "revoked",
    );
  } finally {
    await blocker.query("rollback");
    blocker.release();
    await disabling;
    await enabling;
  }
});
