import "server-only";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";
import type { ProposalQuery } from "./adapter";

// Quarantined prototype: no app imports, env loading or hosted target support.
const credentials = z
  .object({
    user: z.string().regex(/^ggs_fixture_(intake|review)_[a-f0-9]{12}$/),
    password: z.string().min(32).max(256),
  })
  .strict();
const configuration = z
  .object({
    appEnv: z.literal("test"),
    acknowledgement: z.literal("disposable-local-postgres17"),
    host: z.literal("127.0.0.1"),
    port: z.literal(55438),
    database: z.string().regex(/^ggs_pg17_[a-f0-9]{12}$/),
    ca: z.string().min(64).max(32768),
    intake: credentials,
    review: credentials,
  })
  .strict()
  .refine(
    (value) =>
      value.intake.user.startsWith("ggs_fixture_intake_") &&
      value.review.user.startsWith("ggs_fixture_review_") &&
      value.intake.password !== value.review.password,
  );

export class StorageTransportError extends Error {
  constructor(public readonly code: string = "08006") {
    super("Application storage transport unavailable.");
    this.name = "StorageTransportError";
  }
}
const safeCodes = new Set([
  "P0003", // Existing adapter's conflict/missing/denied/validation mapping.
  "P0002",
  "42501",
  "23514",
  "23502",
  "22023",
  "57014", // Statement cancelled by the server deadline.
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);
function sanitized(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return new StorageTransportError(
    typeof code === "string" && safeCodes.has(code) ? code : "08006",
  );
}

export function createIsolatedStorageTransport(input: unknown): {
  intake: ProposalQuery;
  review: ProposalQuery;
  close(): Promise<void>;
} {
  const parsed = configuration.safeParse(input);
  // Never expose Zod issues/input, a driver error, config or password in errors.
  if (!parsed.success) throw new StorageTransportError();
  const config = parsed.data;
  let closed = false;
  let closing: Promise<void> | undefined;
  const pools: Pool[] = [];
  function channel(kind: "intake" | "review"): ProposalQuery {
    // pg supports this startup parameter; @types/pg does not yet declare it.
    const poolConfig: PoolConfig & { replication: string } = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config[kind].user,
      password: config[kind].password,
      ssl: { ca: config.ca, rejectUnauthorized: true, minVersion: "TLSv1.2" },
      sslnegotiation: "postgres",
      // Nonempty explicit startup values defeat node-postgres PG* fallbacks.
      options: "-c timezone=UTC",
      client_encoding: "UTF8",
      replication: "false",
      application_name: `ggs_isolated_${kind}`,
      statement_timeout: 10000,
      lock_timeout: 3000,
      idle_in_transaction_session_timeout: 15000,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 1,
      keepAlive: true,
      keepAliveInitialDelayMillis: 1000,
    };
    const pool = new Pool(poolConfig);
    pools.push(pool);
    let unhealthy = false;
    // Idle socket errors must not crash the process or leak driver diagnostics.
    // Fail closed until the caller closes/recreates this prototype transport.
    pool.on("error", () => {
      unhealthy = true;
    });
    return {
      async query(sql, values) {
        if (closed || unhealthy) throw new StorageTransportError();
        let client: PoolClient | undefined;
        let failed = false;
        try {
          client = await pool.connect();
          if (closed || unhealthy) throw new StorageTransportError();
          // Unnamed parameterized query; no automatic retry after unknown outcome.
          const result = await client.query<Record<string, unknown>>(
            sql,
            values,
          );
          return { rows: result.rows };
        } catch (error) {
          failed = true;
          throw sanitized(error);
        } finally {
          client?.release(failed);
        }
      },
    };
  }
  const intake = channel("intake");
  const review = channel("review");
  return {
    intake,
    review,
    close() {
      closed = true;
      closing ??= Promise.all(pools.map((pool) => pool.end())).then(
        () => undefined,
        () => {
          throw new StorageTransportError();
        },
      );
      return closing;
    },
  };
}
