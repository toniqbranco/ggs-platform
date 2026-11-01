import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { Client } from "pg";
import { readStoredReview } from "../../src/lib/pilot/review-database";
const owner = "00000000-0000-4000-8000-000000000001";
const ca = readFileSync("certificates/supabase-prod-ca-2021.crt", "utf8");
const deps = {
  credential: async () => ({
    user: "ggs_pilot_review_login.rchxnmpsxfbsicthasxn" as const,
    password: "b".repeat(64),
  }),
  certificate: async () => ca,
};
test("application reader pins connection identity, wraps reads in a read-only transaction and returns only allowed fields", async () => {
  const prior = process.env.APP_ENV;
  process.env.APP_ENV = "development";
  const queries: { sql: string; values: unknown }[] = [];
  mock.method(Client.prototype, "connect", async () => {});
  mock.method(Client.prototype, "end", async () => {});
  mock.method(
    Client.prototype,
    "query",
    async (sql: string, values: unknown) => {
      queries.push({ sql, values });
      if (sql.startsWith("select current_user"))
        return {
          rows: [
            {
              actor: "ggs_pilot_review_login",
              session_actor: "ggs_pilot_review_login",
              db: "postgres",
              tls: true,
            },
          ],
        };
      if (sql.includes("list_applications"))
        return {
          rows: [
            {
              id: owner,
              creator_name: "Fixture",
              email: "fixture@example.invalid",
              country: "Colombia",
              platform: "twitch",
              profile_url: "https://example.invalid/fixture",
              locale: "es",
              review_state: "approved",
              revision: 2,
              created_at: new Date("2026-01-01T00:00:00Z"),
              contact_key: "internal",
              decided_by: owner,
            },
          ],
        };
      if (sql.includes("application_history"))
        return {
          rows: [
            {
              event_kind: "approved",
              revision: 2,
              occurred_at: new Date("2026-01-01T00:00:00Z"),
              actor_auth_id: owner,
            },
          ],
        };
      return { rows: [] };
    },
  );
  try {
    const data = await readStoredReview(
      { operation: "list" },
      owner,
      new AbortController().signal,
      deps,
    );
    assert.equal(data.applications?.length, 1);
    assert.ok(!JSON.stringify(data).includes("contact_key"));
    assert.ok(!JSON.stringify(data).includes("decided_by"));
    const events = await readStoredReview(
      { operation: "history", applicationId: owner },
      owner,
      new AbortController().signal,
      deps,
    );
    assert.equal(events.events?.[0]?.kind, "approved");
    assert.deepEqual(
      queries.filter((q) => q.sql.includes("list_applications"))[0]?.values,
      [owner],
    );
    assert.deepEqual(
      queries.filter((q) => q.sql.includes("application_history"))[0]?.values,
      [owner, owner],
    );
    assert.equal(queries.filter((q) => q.sql === "begin read only").length, 2);
    assert.equal(queries.filter((q) => q.sql === "rollback").length, 2);
    assert.equal(
      queries.some((q) => /submit_application|decide_application/.test(q.sql)),
      false,
    );
  } finally {
    mock.restoreAll();
    if (prior === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prior;
  }
});
test("reader rejects unsafe runtime, invalid input, appended trust and wrong identity before reading application rows", async () => {
  const prior = process.env.APP_ENV;
  const priorNode = process.env.NODE_ENV;
  const priorTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const runtimeEnv: Record<string, string | undefined> = process.env;
  let reads = 0;
  const credential = async () => {
    reads++;
    return deps.credential();
  };
  try {
    process.env.APP_ENV = "production";
    await assert.rejects(
      readStoredReview(
        { operation: "list" },
        owner,
        new AbortController().signal,
        { ...deps, credential },
      ),
    );
    assert.equal(reads, 0);
    process.env.APP_ENV = "development";
    for (const [key, value] of [
      ["NODE_ENV", "production"],
      ["NODE_TLS_REJECT_UNAUTHORIZED", "0"],
    ] as const) {
      const before = runtimeEnv[key];
      runtimeEnv[key] = value;
      await assert.rejects(
        readStoredReview(
          { operation: "list" },
          owner,
          new AbortController().signal,
          { ...deps, credential },
        ),
      );
      if (before === undefined) delete runtimeEnv[key];
      else runtimeEnv[key] = before;
      assert.equal(reads, 0);
    }
    await assert.rejects(
      readStoredReview(
        { operation: "history", applicationId: "bad" },
        owner,
        new AbortController().signal,
        { ...deps, credential },
      ),
    );
    assert.equal(reads, 0);
    await assert.rejects(
      readStoredReview(
        { operation: "list" },
        owner,
        new AbortController().signal,
        { ...deps, certificate: async () => ca + ca },
      ),
    );
    mock.method(Client.prototype, "connect", async () => {});
    mock.method(Client.prototype, "end", async () => {});
    let dataQueries = 0;
    mock.method(Client.prototype, "query", async (sql: string) => {
      if (sql.includes("list_applications")) dataQueries++;
      return {
        rows: sql.startsWith("select current_user")
          ? [
              {
                actor: "postgres",
                session_actor: "postgres",
                db: "postgres",
                tls: true,
              },
            ]
          : [],
      };
    });
    await assert.rejects(
      readStoredReview(
        { operation: "list" },
        owner,
        new AbortController().signal,
        deps,
      ),
    );
    assert.equal(dataQueries, 0);
  } finally {
    mock.restoreAll();
    if (prior === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prior;
    if (priorNode === undefined) delete runtimeEnv.NODE_ENV;
    else runtimeEnv.NODE_ENV = priorNode;
    if (priorTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = priorTls;
  }
});
