import "server-only";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";
import { X509Certificate } from "node:crypto";
import type { ProposalQuery } from "./adapter";

// Quarantined prototype: no app imports or env loading. Hosted use needs
// separately approved dedicated credentials; this module provisions nothing.
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

const testingProject = "rchxnmpsxfbsicthasxn";
const testingConfiguration = z
  .object({
    appEnv: z.literal("development"),
    acknowledgement: z.literal("reviewed-gg-livestream-testing"),
    projectId: z.literal(testingProject),
    host: z.literal("aws-1-us-west-2.pooler.supabase.com"),
    port: z.literal(5432),
    database: z.literal("postgres"),
    ca: z.string().min(64).max(32768),
    intake: z
      .object({
        user: z.literal(`ggs_pilot_intake_login.${testingProject}`),
        password: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    review: z
      .object({
        user: z.literal(`ggs_pilot_review_login.${testingProject}`),
        password: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict()
  .refine((value) => value.intake.password !== value.review.password);

function reviewedCA(pem: string) {
  try {
    // Require exactly the reviewed public CA, not an appended trust bundle.
    const blocks = pem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );
    if (blocks?.length !== 1 || pem.trim() !== blocks[0]) return false;
    const certificate = new X509Certificate(pem);
    return (
      certificate.ca &&
      certificate.fingerprint256 ===
        "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA" &&
      Date.parse(certificate.validFrom) <= Date.now() &&
      Date.parse(certificate.validTo) > Date.now()
    );
  } catch {
    return false;
  }
}

export function createTestingStorageTransport(input: unknown) {
  if (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new StorageTransportError();
  }
  const parsed = testingConfiguration.safeParse(input);
  if (!parsed.success || !reviewedCA(parsed.data.ca))
    throw new StorageTransportError();
  return createTransport(parsed.data, "ggs_testing");
}

export function createIsolatedStorageTransport(input: unknown): {
  intake: ProposalQuery;
  review: ProposalQuery;
  close(): Promise<void>;
} {
  const parsed = configuration.safeParse(input);
  // Never expose Zod issues/input, a driver error, config or password in errors.
  if (!parsed.success) throw new StorageTransportError();
  return createTransport(parsed.data, "ggs_isolated");
}

type TransportConfiguration = {
  host: string;
  port: number;
  database: string;
  ca: string;
  intake: { user: string; password: string };
  review: { user: string; password: string };
};
function createTransport(
  config: TransportConfiguration,
  applicationName: string,
) {
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
      application_name: `${applicationName}_${kind}`,
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
