// Opt-in test harness only. Never reads .env.local, PGHOST, or any database URL.
export function postgres17TestConfig(
  env: Readonly<Record<string, string | undefined>>,
) {
  if (
    env.APP_ENV !== "test" ||
    env.GGS_PG17_TEST_ACK !== "disposable-local-postgres17" ||
    (env.GGS_PG17_TEST_PORT ?? "55437") !== "55437" ||
    !env.GGS_PG17_TEST_PASSWORD ||
    env.GGS_PG17_TEST_PASSWORD.length < 16
  ) {
    throw new Error(
      "PostgreSQL 17 tests require explicit isolated-loopback fixture configuration.",
    );
  }
  return {
    host: "127.0.0.1",
    port: 55437,
    database: "ggs_pg17_isolated_test",
    user: "ggs_test_admin",
    password: env.GGS_PG17_TEST_PASSWORD,
    ssl: false as const,
    // A nonempty explicit value prevents node-postgres's PGOPTIONS fallback.
    options: "-c timezone=UTC",
    connectionTimeoutMillis: 5000,
    statement_timeout: 12000,
    idle_in_transaction_session_timeout: 15000,
    max: 4,
  };
}
