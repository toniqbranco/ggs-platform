import "server-only";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { createTestingStorageTransport } from "./transport";

export const operatorProject = "rchxnmpsxfbsicthasxn";
const roles = ["ggs_pilot_intake_login", "ggs_pilot_review_login"] as const;
const groups = ["ggs_pilot_intake", "ggs_pilot_review"] as const;
const marker = (operation: string) => `ggs-testing-handoff:${operation}`;
const operationSchema = z.uuid();
const channel = (role: string) =>
  z
    .object({
      user: z.literal(`${role}.${operatorProject}`),
      password: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict();
const bundleSchema = z
  .object({
    version: z.literal(1),
    projectId: z.literal(operatorProject),
    intake: channel(roles[0]),
    review: channel(roles[1]),
  })
  .strict()
  .refine((b) => b.intake.password !== b.review.password);
export type OperatorBundle = z.infer<typeof bundleSchema>;
export class OperatorUnavailable extends Error {
  constructor() {
    super("GG testing operator unavailable.");
    this.name = "OperatorUnavailable";
  }
}

// ASCII hex passwords need no SASLprep normalization. Verifiers remain sensitive.
function verifier(password: string) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  try {
    const client = createHmac("sha256", salted).update("Client Key").digest();
    const stored = createHash("sha256").update(client).digest("base64");
    client.fill(0);
    const server = createHmac("sha256", salted)
      .update("Server Key")
      .digest("base64");
    return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
  } finally {
    salted.fill(0);
  }
}

// No caller-controlled identifiers. UUID/hex validation precedes interpolation.
export function prepareOperatorSql(operation: string, input: unknown) {
  operationSchema.parse(operation);
  const bundle = bundleSchema.parse(input);
  const statements = roles.map((role, index) => {
    const password =
      index === 0 ? bundle.intake.password : bundle.review.password;
    return `create role ${role} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${verifier(password)}';
grant ${groups[index]} to ${role} with inherit true,set false,admin false;
comment on role ${role} is '${marker(operation)}:prepared';`;
  });
  return `do $ggs$ begin
perform pg_advisory_xact_lock(hashtextextended('${marker(operation)}',0));
if exists(select 1 from pg_roles where rolname in ('${roles[0]}','${roles[1]}')) then raise exception 'operator_role_conflict'; end if;
${statements.join("\n")}
end $ggs$;`;
}

export const operatorFactsSql = `select r.rolname name,r.rolcanlogin login,r.rolsuper superuser,r.rolcreatedb createdb,r.rolcreaterole createrole,r.rolreplication replication,r.rolbypassrls bypassrls,
shobj_description(r.oid,'pg_authid') marker,
has_schema_privilege(r.oid,'ggs_pilot','USAGE') schema_usage,
(select count(*)::int from pg_namespace n where has_schema_privilege(r.oid,n.oid,'CREATE')) schema_create_count,
(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ggs_pilot' and c.relkind='r' and has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) table_privileges,
(select coalesce(jsonb_agg(jsonb_build_object('parent',p.rolname,'inherit',m.inherit_option,'set',m.set_option,'admin',m.admin_option)),'[]'::jsonb) from pg_auth_members m join pg_roles p on p.oid=m.roleid where m.member=r.oid) memberships,
(select coalesce(jsonb_agg(p.proname order by p.proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ggs_pilot' and has_function_privilege(r.oid,p.oid,'EXECUTE')) functions
from pg_roles r where r.rolname in ('${roles[0]}','${roles[1]}') order by r.rolname`;
const factSchema = z
  .object({
    name: z.enum(roles),
    login: z.boolean(),
    superuser: z.literal(false),
    createdb: z.literal(false),
    createrole: z.literal(false),
    replication: z.literal(false),
    bypassrls: z.literal(false),
    marker: z.string(),
    schema_usage: z.literal(true),
    schema_create_count: z.literal(0),
    table_privileges: z.literal(0),
    memberships: z
      .array(
        z
          .object({
            parent: z.string(),
            inherit: z.literal(true),
            set: z.literal(false),
            admin: z.literal(false),
          })
          .strict(),
      )
      .length(1),
    functions: z.array(z.string()),
  })
  .strict();
export function assertOperatorFacts(
  input: unknown,
  operation: string,
  login: boolean,
  phase: "prepared" | "enabled" | "revoked" = login ? "enabled" : "prepared",
) {
  operationSchema.parse(operation);
  const facts = z.array(factSchema).length(2).parse(input);
  for (const [index, role] of roles.entries()) {
    const fact = facts.find((row) => row.name === role);
    const expected =
      index === 0
        ? ["submit_application"]
        : ["application_history", "decide_application", "list_applications"];
    if (
      !fact ||
      fact.login !== login ||
      fact.marker !== `${marker(operation)}:${phase}` ||
      fact.memberships[0]!.parent !== groups[index] ||
      JSON.stringify(fact.functions) !== JSON.stringify(expected)
    )
      throw new OperatorUnavailable();
  }
}

export function operatorTransitionSql(operation: string, enable: boolean) {
  operationSchema.parse(operation);
  // Atomic name/marker/profile check; never disable or enable unrelated identities.
  return `do $ggs$ declare r record; begin
perform pg_advisory_xact_lock(hashtextextended('${marker(operation)}',0));
if (select count(*) from pg_roles where rolname in ('${roles[0]}','${roles[1]}'))<>2 then raise exception 'operator_roles_missing'; end if;
for r in select * from pg_roles where rolname in ('${roles[0]}','${roles[1]}') loop
if ${enable ? `shobj_description(r.oid,'pg_authid') is distinct from '${marker(operation)}:prepared'` : `coalesce(shobj_description(r.oid,'pg_authid'),'') not in ('${marker(operation)}:prepared','${marker(operation)}:enabled','${marker(operation)}:revoked')`} then raise exception 'operator_marker_conflict'; end if;
${
  enable
    ? `if r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls then raise exception 'operator_profile_conflict'; end if;
if (select count(*) from pg_auth_members where member=r.oid)<>1 or not exists(select 1 from pg_auth_members m join pg_roles p on p.oid=m.roleid where m.member=r.oid and p.rolname=case when r.rolname='${roles[0]}' then '${groups[0]}' else '${groups[1]}' end and m.inherit_option and not m.set_option and not m.admin_option) then raise exception 'operator_membership_conflict'; end if;
if exists(select 1 from pg_namespace n where has_schema_privilege(r.oid,n.oid,'CREATE')) or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ggs_pilot' and c.relkind='r' and has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) then raise exception 'operator_privilege_conflict'; end if;
if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ggs_pilot' and has_function_privilege(r.oid,p.oid,'EXECUTE')) <> (case when r.rolname='${roles[0]}' then 1 else 3 end) then raise exception 'operator_routine_conflict'; end if;
if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ggs_pilot' and has_function_privilege(r.oid,p.oid,'EXECUTE') and not ((r.rolname='${roles[0]}' and p.proname='submit_application') or (r.rolname='${roles[1]}' and p.proname in ('application_history','decide_application','list_applications')))) then raise exception 'operator_routine_conflict'; end if;`
    : ""
}
end loop;
alter role ${roles[0]} ${enable ? "login" : "nologin"};
alter role ${roles[1]} ${enable ? "login" : "nologin"};
comment on role ${roles[0]} is '${marker(operation)}:${enable ? "enabled" : "revoked"}';
comment on role ${roles[1]} is '${marker(operation)}:${enable ? "enabled" : "revoked"}';
end $ggs$;`;
}

const configuration = z
  .object({
    appEnv: z.literal("development"),
    acknowledgement: z.literal("reviewed-gg-livestream-testing-provisioning"),
    accessToken: z.string().regex(/^[A-Za-z0-9._~-]{32,4096}$/),
  })
  .strict();
export function operatorTerminationSql(operation: string) {
  operationSchema.parse(operation);
  return `select pg_terminate_backend(a.pid) terminated from pg_stat_activity a join pg_roles r on r.oid=a.usesysid where r.rolname in ('${roles[0]}','${roles[1]}') and shobj_description(r.oid,'pg_authid')='${marker(operation)}:revoked' and a.pid<>pg_backend_pid()`;
}
type RuntimeProbe = (bundle: OperatorBundle) => Promise<void>;
async function actualProbe(bundle: OperatorBundle) {
  const transport = createTestingStorageTransport({
    appEnv: "development",
    acknowledgement: "reviewed-gg-livestream-testing",
    projectId: operatorProject,
    host: "aws-1-us-west-2.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    ca: readFileSync(
      new URL(
        "../../tests/fixtures/supabase-public-ca-2021.crt",
        import.meta.url,
      ),
      "utf8",
    ),
    intake: bundle.intake,
    review: bundle.review,
  });
  try {
    for (const [kind, channel] of [
      ["intake", transport.intake],
      ["review", transport.review],
    ] as const) {
      const result = await channel.query(
        "select current_user actor,session_user session_actor,current_database() database,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) upstream_tls",
        [],
      );
      const expected = `ggs_pilot_${kind}_login`;
      if (
        result.rows.length !== 1 ||
        result.rows[0]!.actor !== expected ||
        result.rows[0]!.session_actor !== expected ||
        result.rows[0]!.database !== "postgres" ||
        result.rows[0]!.upstream_tls !== true
      )
        throw new OperatorUnavailable();
      try {
        await channel.query("select * from ggs_pilot.applications limit 0", []);
        throw new OperatorUnavailable();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "42501"
        )
          throw new OperatorUnavailable();
      }
    }
  } finally {
    await transport.close();
  }
}

export function createSupabaseOperator(
  input: unknown,
  dependencies: { request?: typeof fetch; probe?: RuntimeProbe } = {},
) {
  if (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw new OperatorUnavailable();
  const parsed = configuration.safeParse(input);
  if (!parsed.success) throw new OperatorUnavailable();
  const token = parsed.data.accessToken;
  const request = dependencies.request ?? fetch;
  const probe = dependencies.probe ?? actualProbe;
  async function api(
    path: "" | "/database/query",
    query?: string,
    readOnly = true,
  ) {
    try {
      const response = await request(
        `https://api.supabase.com/v1/projects/${operatorProject}${path}`,
        {
          method: path === "" ? "GET" : "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          ...(query === undefined
            ? {}
            : {
                body: JSON.stringify({
                  query: readOnly
                    ? query
                    : `begin; set local statement_timeout='10s'; set local lock_timeout='3s'; ${query}; commit;`,
                  read_only: readOnly,
                }),
              }),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok || response.redirected) throw new OperatorUnavailable();
      const text = await response.text();
      if (text.length > 65536) throw new OperatorUnavailable();
      return JSON.parse(text) as unknown;
    } catch {
      throw new OperatorUnavailable();
    }
  }
  async function target() {
    const project = z
      .object({
        id: z.literal(operatorProject),
        name: z.literal("GG-livestream"),
        status: z.literal("ACTIVE_HEALTHY"),
        region: z.literal("us-west-2"),
        database: z.object({ version: z.string().regex(/^17\.11\./) }),
      })
      .parse(await api(""));
    return project.id;
  }
  const receipt = (operationId: string, state: string) => ({
    projectId: operatorProject,
    operationId,
    state,
  });
  return {
    async run(
      action: "preflight" | "prepare" | "enable" | "verify" | "disable",
      operation: string,
      rawBundle?: unknown,
    ) {
      try {
        operationSchema.parse(operation);
        if (
          !["preflight", "prepare", "enable", "verify", "disable"].includes(
            action,
          )
        )
          throw new OperatorUnavailable();
        await target();
        if (action === "preflight") {
          const rows = z
            .array(
              z
                .object({
                  roles_absent: z.literal(true),
                  owner_empty: z.literal(true),
                  public_create: z.literal(false),
                  forced_tables: z.literal(4),
                })
                .strict(),
            )
            .length(1)
            .parse(
              await api(
                "/database/query",
                `select not exists(select 1 from pg_roles where rolname in ('${roles[0]}','${roles[1]}')) roles_absent,not exists(select 1 from ggs_pilot.review_configuration) owner_empty,has_schema_privilege('ggs_pilot_intake','public','CREATE') public_create,(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ggs_pilot' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) forced_tables`,
              ),
            );
          return {
            projectId: operatorProject,
            rolesAbsent: rows[0]!.roles_absent,
            ownerEmpty: rows[0]!.owner_empty,
            publicCreate: false,
          };
        }
        if (action === "prepare") {
          const bundle = bundleSchema.parse(rawBundle);
          // Recheck absence inside the single transactional DO block as well.
          await api(
            "/database/query",
            prepareOperatorSql(operation, bundle),
            false,
          );
          assertOperatorFacts(
            await api("/database/query", operatorFactsSql),
            operation,
            false,
          );
          return receipt(operation, "both-disabled");
        }
        if (action === "enable") {
          assertOperatorFacts(
            await api("/database/query", operatorFactsSql),
            operation,
            false,
          );
          await api(
            "/database/query",
            operatorTransitionSql(operation, true),
            false,
          );
          assertOperatorFacts(
            await api("/database/query", operatorFactsSql),
            operation,
            true,
          );
          return receipt(operation, "both-enabled");
        }
        if (action === "verify") {
          const bundle = bundleSchema.parse(rawBundle);
          assertOperatorFacts(
            await api("/database/query", operatorFactsSql),
            operation,
            true,
          );
          const rows = z
            .array(z.object({ owner_empty: z.literal(true) }).strict())
            .length(1)
            .parse(
              await api(
                "/database/query",
                "select not exists(select 1 from ggs_pilot.review_configuration) owner_empty",
              ),
            );
          if (!rows[0]!.owner_empty) throw new OperatorUnavailable();
          await probe(bundle);
          return receipt(operation, "identity-tls-permissions-verified");
        }
        await api(
          "/database/query",
          operatorTransitionSql(operation, false),
          false,
        );
        // A failed termination cannot produce a confirmed recovery receipt.
        await api("/database/query", operatorTerminationSql(operation), false);
        const deadline = Date.now() + 2000;
        while (true) {
          const rows = z
            .array(
              z.object({ sessions: z.number().int().nonnegative() }).strict(),
            )
            .length(1)
            .parse(
              await api(
                "/database/query",
                `select count(*)::int sessions from pg_stat_activity where usename in ('${roles[0]}','${roles[1]}')`,
              ),
            );
          if (rows[0]!.sessions === 0) break;
          if (Date.now() >= deadline) throw new OperatorUnavailable();
          await delay(50);
        }
        assertOperatorFacts(
          await api("/database/query", operatorFactsSql),
          operation,
          false,
          "revoked",
        );
        return receipt(operation, "both-disabled-sessions-closed");
      } catch {
        throw new OperatorUnavailable();
      }
    },
  };
}
