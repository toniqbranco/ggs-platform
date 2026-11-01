import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createSupabaseOperator,
  OperatorUnavailable,
  operatorProject,
  prepareOperatorSql,
  assertOperatorFacts,
} from "../../proposals/application-storage/operator-adapter";

const config = {
  appEnv: "development",
  acknowledgement: "reviewed-gg-livestream-testing-provisioning",
  accessToken: "fixture_operator_token_" + "x".repeat(40),
};
const bundle = {
  version: 1,
  projectId: operatorProject,
  intake: {
    user: `ggs_pilot_intake_login.${operatorProject}`,
    password: "a".repeat(64),
  },
  review: {
    user: `ggs_pilot_review_login.${operatorProject}`,
    password: "b".repeat(64),
  },
};
const project = {
  id: operatorProject,
  name: "GG-livestream",
  status: "ACTIVE_HEALTHY",
  region: "us-west-2",
  database: { version: "17.11.0.011" },
};
function facts(
  operation: string,
  login = false,
  phase = login ? "enabled" : "prepared",
) {
  return ["intake", "review"].map((kind) => ({
    name: `ggs_pilot_${kind}_login`,
    login,
    superuser: false,
    createdb: false,
    createrole: false,
    replication: false,
    bypassrls: false,
    marker: `ggs-testing-handoff:${operation}:${phase}`,
    schema_usage: true,
    schema_create_count: 0,
    table_privileges: 0,
    memberships: [
      { parent: `ggs_pilot_${kind}`, inherit: true, set: false, admin: false },
    ],
    functions:
      kind === "intake"
        ? ["submit_application"]
        : ["application_history", "decide_application", "list_applications"],
  }));
}
function mockRequest(
  operation: string,
  options: {
    login?: boolean;
    failWrite?: boolean;
    wrongTarget?: boolean;
    status?: number;
    sessions?: number[];
  } = {},
) {
  const calls: { url: string; init: RequestInit; sql: string }[] = [];
  let currentLogin = options.login ?? false;
  let currentPhase = currentLogin ? "enabled" : "prepared";
  const request: typeof fetch = async (url, init) => {
    const sql = init?.body
      ? (JSON.parse(String(init.body)).query as string)
      : "";
    calls.push({ url: String(url), init: init ?? {}, sql });
    if (options.status)
      return new Response("private provider diagnostic", {
        status: options.status,
      });
    if (!sql)
      return Response.json({
        ...project,
        ...(options.wrongTarget ? { id: "other" } : {}),
      });
    if (sql.startsWith("begin;")) {
      if (options.failWrite) throw new Error(bundle.intake.password);
      if (sql.includes(":revoked")) {
        currentLogin = false;
        currentPhase = "revoked";
      } else if (sql.includes("alter role") && sql.includes(" login;")) {
        currentLogin = true;
        currentPhase = "enabled";
      }
      return Response.json([]);
    }
    if (sql.includes("roles_absent"))
      return Response.json([
        {
          roles_absent: true,
          owner_empty: true,
          public_create: false,
          forced_tables: 4,
        },
      ]);
    if (sql.includes("r.rolname name"))
      return Response.json(facts(operation, currentLogin, currentPhase));
    if (sql.includes("owner_empty"))
      return Response.json([{ owner_empty: true }]);
    if (sql.includes("sessions"))
      return Response.json([{ sessions: options.sessions?.shift() ?? 0 }]);
    return Response.json([]);
  };
  return { calls, request };
}
const unavailable = (error: unknown) =>
  error instanceof OperatorUnavailable &&
  error.message === "GG testing operator unavailable." &&
  !error.cause;
test("operator rejects unsafe configuration and actual production before any network", () => {
  for (const change of [
    { appEnv: "production" },
    { acknowledgement: "" },
    { accessToken: "" },
    { accessToken: "x".repeat(40) + "\r\nheader" },
    { host: "example.invalid" },
    { projectId: "other" },
  ])
    assert.throws(
      () => createSupabaseOperator({ ...config, ...change }),
      unavailable,
    );
  const original = process.env.APP_ENV;
  try {
    process.env.APP_ENV = "production";
    assert.throws(() => createSupabaseOperator(config), unavailable);
  } finally {
    if (original === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = original;
  }
  const tls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    assert.throws(() => createSupabaseOperator(config), unavailable);
  } finally {
    if (tls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tls;
  }
});
test("preflight uses only exact HTTPS project/query endpoints with redirects refused", async () => {
  const operation = randomUUID();
  const fake = mockRequest(operation);
  const result = await createSupabaseOperator(config, {
    request: fake.request,
  }).run("preflight", operation);
  assert.equal(result.projectId, operatorProject);
  assert.equal(fake.calls.length, 2);
  for (const call of fake.calls) {
    assert.ok(
      call.url.startsWith(
        `https://api.supabase.com/v1/projects/${operatorProject}`,
      ),
    );
    assert.equal(call.init.redirect, "error");
    assert.ok(call.init.signal);
  }
  assert.equal(JSON.parse(String(fake.calls[1]!.init.body)).read_only, true);
});
test("wrong project metadata stops before SQL", async () => {
  const operation = randomUUID();
  const fake = mockRequest(operation, { wrongTarget: true });
  await assert.rejects(
    createSupabaseOperator(config, { request: fake.request }).run(
      "preflight",
      operation,
    ),
    unavailable,
  );
  assert.equal(fake.calls.length, 1);
});
test("401/403/429/provider errors are sanitized without retry", async () => {
  for (const status of [401, 403, 429, 500]) {
    const operation = randomUUID();
    const fake = mockRequest(operation, { status });
    await assert.rejects(
      createSupabaseOperator(config, { request: fake.request }).run(
        "preflight",
        operation,
      ),
      unavailable,
    );
    assert.equal(fake.calls.length, 1);
  }
});
test("disabled preparation sends verifiers, bounded transactional SQL and safe receipt", async () => {
  const operation = randomUUID();
  const fake = mockRequest(operation);
  const result = await createSupabaseOperator(config, {
    request: fake.request,
  }).run("prepare", operation, bundle);
  assert.ok("state" in result);
  assert.equal(result.state, "both-disabled");
  const write = fake.calls.find((call) => call.sql.startsWith("begin;"))!;
  assert.ok(write.sql.includes("statement_timeout='10s'"));
  assert.ok(write.sql.includes("lock_timeout='3s'"));
  assert.ok(write.sql.includes("SCRAM-SHA-256$4096:"));
  assert.ok(
    !write.sql.includes(bundle.intake.password) &&
      !write.sql.includes(bundle.review.password),
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /SCRAM|password|fixture_operator_token/,
  );
});
test("SQL validation rejects operation injection and credential/role confusion", () => {
  assert.throws(() => prepareOperatorSql("bad'; drop role postgres", bundle));
  assert.throws(() =>
    prepareOperatorSql(randomUUID(), {
      ...bundle,
      intake: { ...bundle.intake, user: "postgres" },
    }),
  );
  assert.throws(() =>
    prepareOperatorSql(randomUUID(), {
      ...bundle,
      review: { ...bundle.review, password: bundle.intake.password },
    }),
  );
});
test("privilege, membership and marker drift cannot pass role evidence", () => {
  const operation = randomUUID();
  assertOperatorFacts(facts(operation), operation, false);
  for (const change of [
    { superuser: true },
    { marker: "other" },
    { schema_create_count: 1 },
    { table_privileges: 1 },
    {
      memberships: [
        {
          parent: "ggs_pilot_executor",
          inherit: true,
          set: false,
          admin: false,
        },
      ],
    },
    { functions: ["require_ready"] },
  ]) {
    const rows = facts(operation);
    Object.assign(rows[0]!, change);
    assert.throws(() => assertOperatorFacts(rows, operation, false));
  }
});
test("uncertain enable write is not retried or labelled successful", async () => {
  const operation = randomUUID();
  const fake = mockRequest(operation, { failWrite: true });
  await assert.rejects(
    createSupabaseOperator(config, { request: fake.request }).run(
      "enable",
      operation,
    ),
    unavailable,
  );
  assert.equal(
    fake.calls.filter((call) => call.sql.startsWith("begin;")).length,
    1,
  );
});
test("verify cannot claim success when authenticated probe fails", async () => {
  const operation = randomUUID();
  const fake = mockRequest(operation, { login: true });
  let probes = 0;
  await assert.rejects(
    createSupabaseOperator(config, {
      request: fake.request,
      probe: async () => {
        probes++;
        throw new Error(bundle.intake.password);
      },
    }).run("verify", operation, bundle),
    unavailable,
  );
  assert.equal(probes, 1);
});
test("recovery requires disabled profiles and zero remaining sessions", async () => {
  const operation = randomUUID();
  const fake = mockRequest(operation, { sessions: [1, 0] });
  const result = await createSupabaseOperator(config, {
    request: fake.request,
  }).run("disable", operation);
  assert.ok("state" in result);
  assert.equal(result.state, "both-disabled-sessions-closed");
  assert.ok(
    fake.calls.some((call) => call.sql.includes("pg_terminate_backend")),
  );
  assert.equal(
    fake.calls.filter((call) => call.sql.includes("sessions")).length,
    2,
  );
});
