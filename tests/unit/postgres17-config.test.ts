import assert from "node:assert/strict";
import test from "node:test";
import { postgres17TestConfig } from "../postgres17/config";

test("real PostgreSQL tests refuse implicit, production or arbitrary-port configuration", () => {
  const fixture = {
    APP_ENV: "test",
    GGS_PG17_TEST_ACK: "disposable-local-postgres17",
    GGS_PG17_TEST_PASSWORD: "isolated-fixture-only",
  };
  for (const input of [
    {},
    { ...fixture, APP_ENV: "production" },
    { ...fixture, GGS_PG17_TEST_ACK: "" },
    { ...fixture, GGS_PG17_TEST_PORT: "5432" },
    { ...fixture, GGS_PG17_TEST_PASSWORD: "short" },
  ])
    assert.throws(() => postgres17TestConfig(input), /isolated-loopback/);
  const config = postgres17TestConfig({
    ...fixture,
    PGHOST: "remote.invalid",
    PGOPTIONS: "-c role=untrusted_fixture",
    DATABASE_URL: "postgres://remote.invalid/production",
    SUPABASE_DB_URL: "postgres://remote.invalid/live",
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.database, "ggs_pg17_isolated_test");
  assert.equal(config.port, 55437);
  assert.equal(config.options, "-c timezone=UTC");
});
