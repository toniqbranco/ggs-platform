import "server-only";
import { Client, type ClientConfig } from "pg";
import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function withTestingReadOnlyClient<T>(
  actor: "ggs_pilot_review_login" | "ggs_ob_reader_login",
  credential: { user: string; password: string },
  signal: AbortSignal,
  run: (client: Client) => Promise<T>,
  certificateSource?: () => Promise<string>,
) {
  if (
    credential.user !== actor + ".rchxnmpsxfbsicthasxn" ||
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV !==
      (actor === "ggs_ob_reader_login" ? "test" : "development") ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    signal.aborted
  )
    throw new Error("Testing database unavailable.");
  const ca = await (
    certificateSource ??
    (() =>
      readFile(
        path.join(process.cwd(), "certificates/supabase-prod-ca-2021.crt"),
        "utf8",
      ))
  )();
  const certificate = new X509Certificate(ca);
  if (
    ca.match(/-----BEGIN CERTIFICATE-----/g)?.length !== 1 ||
    ca.trim() !==
      ca.match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/,
      )?.[0] ||
    !certificate.ca ||
    certificate.fingerprint256 !==
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA" ||
    Date.parse(certificate.validFrom) > Date.now() ||
    Date.parse(certificate.validTo) <= Date.now()
  )
    throw new Error("Testing database unavailable.");
  const clientConfig: ClientConfig & { replication: string } = {
    host: "aws-1-us-west-2.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: credential.user,
    password: credential.password,
    ssl: { ca, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    sslnegotiation: "postgres",
    options: "-c timezone=UTC",
    client_encoding: "UTF8",
    replication: "false",
    application_name:
      actor === "ggs_pilot_review_login"
        ? "ggs_owner_readonly"
        : "ggs_setup_readonly",
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    lock_timeout: 1000,
    idle_in_transaction_session_timeout: 10000,
  };
  const client = new Client(clientConfig);
  client.on("error", () => {});
  const abort = () => {
    void client.end().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error();
    await client.connect();
    await client.query("begin read only");
    const identity = (
      await client.query(
        "select current_user actor,session_user session_actor,current_database() db,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) tls",
      )
    ).rows[0];
    if (
      identity?.actor !== actor ||
      identity.session_actor !== identity.actor ||
      identity.db !== "postgres" ||
      identity.tls !== true ||
      signal.aborted
    )
      throw new Error();
    return await run(client);
  } finally {
    signal.removeEventListener("abort", abort);
    try {
      await client.query("rollback");
    } catch {
      /* No writes and no diagnostics. */
    }
    await client.end();
  }
}
