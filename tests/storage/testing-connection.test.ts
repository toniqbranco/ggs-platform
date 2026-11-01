import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { Pool, type PoolConfig } from "pg";
import {
  createTestingStorageTransport,
  StorageTransportError,
} from "../../proposals/application-storage/transport";

// Public certificate, not a credential. These repeated-character passwords are
// fictional and never sent to any server. Pool.connect is intercepted below.
const ca = readFileSync("tests/fixtures/supabase-public-ca-2021.crt", "utf8");
const input = (change: Record<string, unknown> = {}) => ({
  appEnv: "development",
  acknowledgement: "reviewed-gg-livestream-testing",
  projectId: "rchxnmpsxfbsicthasxn",
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  ca,
  intake: {
    user: "ggs_pilot_intake_login.rchxnmpsxfbsicthasxn",
    password: "a".repeat(64),
  },
  review: {
    user: "ggs_pilot_review_login.rchxnmpsxfbsicthasxn",
    password: "b".repeat(64),
  },
  ...change,
});
const failure = (error: unknown) =>
  error instanceof StorageTransportError &&
  error.code === "08006" &&
  error.message === "Application storage transport unavailable." &&
  !error.cause;

test("testing factory refuses an actual production runtime despite development input", () => {
  for (const key of ["APP_ENV", "NODE_ENV"]) {
    const original = process.env[key];
    try {
      process.env[key] = "production";
      assert.throws(() => createTestingStorageTransport(input()), failure);
    } finally {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  }
});

test("testing connection rejects production, target changes and configuration overrides before connecting", () => {
  let attempts = 0;
  const intercepted = mock.method(Pool.prototype, "connect", () => {
    attempts++;
    throw new Error("Network forbidden in this test");
  });
  try {
    for (const change of [
      { appEnv: "production" },
      { appEnv: "test" },
      { acknowledgement: "" },
      { projectId: "other-project" },
      { host: "db.rchxnmpsxfbsicthasxn.supabase.co" },
      { host: "127.0.0.1" },
      { port: 6543 },
      { database: "other" },
      { ssl: false },
      { connectionString: "postgres://example.invalid" },
      { options: "-c role=postgres" },
      { ca: "untrusted" },
    ]) {
      assert.throws(
        () => createTestingStorageTransport(input(change)),
        failure,
      );
    }
    assert.throws(() => createTestingStorageTransport({}), failure);
    assert.equal(attempts, 0);
  } finally {
    intercepted.mock.restore();
  }
});
test("testing connection rejects admin, swapped, missing and shared credentials", () => {
  const fixture = input();
  for (const change of [
    { intake: { ...fixture.intake, user: "postgres.rchxnmpsxfbsicthasxn" } },
    {
      review: {
        ...fixture.review,
        user: "ggs_pilot_executor.rchxnmpsxfbsicthasxn",
      },
    },
    { intake: fixture.review },
    { review: fixture.intake },
    { intake: { ...fixture.intake, password: "" } },
    { review: { ...fixture.review, password: fixture.intake.password } },
    {
      intake: {
        ...fixture.intake,
        password: "sb_secret_not_a_database_password",
      },
    },
    { review: { ...fixture.review, extra: "forbidden" } },
  ])
    assert.throws(() => createTestingStorageTransport(input(change)), failure);
});
test("testing trust requires exactly one reviewed CA and rejects appended or malformed trust", () => {
  for (const replacement of [
    ca + ca,
    ca + "\nunreviewed trust",
    ca.replace("MIID", "AAAA"),
    "",
  ]) {
    assert.throws(
      () => createTestingStorageTransport(input({ ca: replacement })),
      failure,
    );
  }
});
test("testing pools are lazy, opaque and do not connect merely on construction or close", async () => {
  let attempts = 0;
  const intercepted = mock.method(Pool.prototype, "connect", () => {
    attempts++;
    throw new Error("Network forbidden in this test");
  });
  try {
    const transport = createTestingStorageTransport(input());
    assert.doesNotMatch(
      JSON.stringify(transport),
      /a{64}|b{64}|postgres|pooler/,
    );
    await Promise.all([transport.close(), transport.close()]);
    await assert.rejects(transport.intake.query("select 1", []), failure);
    assert.equal(attempts, 0);
  } finally {
    intercepted.mock.restore();
  }
});
test("testing factory gives each pool the exact target, role, verified TLS and bounded settings without network", async () => {
  const configurations: PoolConfig[] = [];
  const intercepted = mock.method(
    Pool.prototype,
    "connect",
    function (this: Pool) {
      configurations.push((this as unknown as { options: PoolConfig }).options);
      throw new Error(
        "Fictional private driver diagnostic aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
    },
  );
  const transport = createTestingStorageTransport(input());
  try {
    await assert.rejects(
      transport.intake.query("select $1", ["private@example.invalid"]),
      failure,
    );
    await assert.rejects(
      transport.review.query("select $1", ["private@example.invalid"]),
      failure,
    );
    assert.equal(configurations.length, 2);
    for (const [index, config] of configurations.entries()) {
      assert.equal(config.host, "aws-1-us-west-2.pooler.supabase.com");
      assert.equal(config.port, 5432);
      assert.equal(config.database, "postgres");
      assert.equal(
        config.user,
        index === 0 ? input().intake.user : input().review.user,
      );
      assert.equal(
        config.application_name,
        index === 0 ? "ggs_testing_intake" : "ggs_testing_review",
      );
      assert.equal(config.max, 1);
      assert.equal(config.connectionTimeoutMillis, 5000);
      assert.equal(config.statement_timeout, 10000);
      assert.equal(config.lock_timeout, 3000);
      assert.equal(config.options, "-c timezone=UTC");
      assert.deepEqual(config.ssl, {
        ca,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      });
      assert.equal(config.connectionString, undefined);
    }
  } finally {
    await transport.close();
    intercepted.mock.restore();
  }
});
