import "server-only";
import { Client, type ClientConfig } from "pg";
import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readReviewCredential } from "./review-credential";
import {
  reviewRequestSchema,
  storedApplicationSchema,
  storedEventSchema,
  type ReviewRequest,
} from "./stored-review-contract";

export async function readStoredReview(
  input: ReviewRequest,
  ownerId: string,
  signal: AbortSignal,
  dependencies: {
    credential?: typeof readReviewCredential;
    certificate?: () => Promise<string>;
  } = {},
) {
  const value = reviewRequestSchema.parse(input);
  z.uuid().parse(ownerId);
  if (
    process.env.APP_ENV !== "development" ||
    process.env.NODE_ENV === "production" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    signal.aborted
  )
    throw new Error("Private review unavailable.");
  const credential = await (dependencies.credential ?? readReviewCredential)(
    signal,
  );
  const ca = await (
    dependencies.certificate ??
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
    throw new Error("Private review unavailable.");
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
    application_name: "ggs_owner_readonly",
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
      identity?.actor !== "ggs_pilot_review_login" ||
      identity.session_actor !== identity.actor ||
      identity.db !== "postgres" ||
      identity.tls !== true ||
      signal.aborted
    )
      throw new Error();
    if (value.operation === "history") {
      const result = await client.query(
        "select event_kind,revision,occurred_at from ggs_pilot.application_history($1::uuid,$2::uuid,0)",
        [ownerId, value.applicationId],
      );
      return {
        events: z
          .array(storedEventSchema)
          .max(2)
          .parse(
            result.rows.map((row) => ({
              kind: row.event_kind,
              revision: row.revision,
              occurredAt: row.occurred_at,
            })),
          ),
      };
    }
    // One bounded page for the pilot. No arbitrary SQL, mutations or intake client.
    const result = await client.query(
      "select * from ggs_pilot.list_applications($1::uuid,null,null,null,50)",
      [ownerId],
    );
    return {
      applications: z
        .array(storedApplicationSchema)
        .max(50)
        .parse(
          result.rows.map((row) => ({
            id: row.id,
            name: row.creator_name,
            email: row.email,
            country: row.country,
            platform: row.platform,
            profile: row.profile_url,
            locale: row.locale,
            state: row.review_state,
            revision: row.revision,
            createdAt: row.created_at,
          })),
        ),
      bounded: true,
    };
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
