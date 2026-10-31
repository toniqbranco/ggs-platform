# Testing storage connection — review plan

Status: proposed, 2026-10-31. This document authorizes no hosted changes. The
website still imports no storage proposal, accepts no real applications, and
rejects `PILOT_APPLICATIONS_ENABLED=true`. Auth remains a separate existing
integration. No production driver, environment variables or credentials are added.

## Selected approach

For the current long-running local Node.js pilot, recommend the **shared session
pooler**, not a direct IPv6 connection or a transaction-pooler assumption. Take
the exact endpoint from the testing project's Connect dialog at execution time;
do not construct a host from its region. Session mode uses port 5432 and supports
IPv4. This recommendation does not select a deployment platform. Revisit pooling
and capacity before serverless hosting or multiple app instances.

Use node-postgres, already pinned as a development dependency for isolated tests,
for the eventual server-only transport. Moving it to production dependencies and
wiring a connection factory are a later implementation PR. Start with two pools,
each capped at one connection per app process, one for intake and one for review.
Two pools per process multiply with process count; measure capacity and set an
instance limit before deployment. Do not increase Supabase pool settings here.

The project-specific endpoint and credential-free handshake evidence live in the
private delivery report, not in this generic runbook. The earlier TLS probes
verified a shared endpoint's certificate before PostgreSQL authentication. They
did not verify tenant routing, dedicated logins, upstream encryption or a driver.

## Credential and permission contract

The existing SQL creates four NOLOGIN group roles. Keep those roles NOLOGIN.
Propose **two additional, separately approved login roles** with distinct random
secrets: intake inherits only `ggs_pilot_intake`; review inherits only
`ggs_pilot_review`. Neither receives superuser, BYPASSRLS, role/database creation,
replication, ownership, ADMIN OPTION, executor membership or the other entry role.
Do not grant schema CREATE or direct table access. Explicitly review inherited
PUBLIC/default privileges and database CONNECT/TEMP privileges as well.

Shared-pooler custom usernames have the shape `<login-role>.<project-ref>`;
database remains `postgres`. Verify actual current/session identity after login.
Do not use `postgres`, a table owner, the executor, a Supabase service-role key,
or the owner's website password as an app database credential.

Secrets belong only in an approved local/server secret store, never chat, source,
PR text, screenshots, process arguments, connection-URL logs or browser variables.
Do not infer a storage password from existing Auth credentials. A later setup
review must specify exact login names, grants, secret-storage method and rotation
procedure; this plan contains no executable provisioning SQL or passwords.

Fresh owner Auth/admission verification is required before every review call.
The server supplies the verified actor UUID to the adapter. Database credentials
are service identities: the review credential can attest the configured owner;
it is not independent proof of a human session. Keep owner configuration absent
until a separately approved seed. Approval never creates/invites an Auth user or
grants workspace admission.

## Transport and failure contract

- Supply explicit host, port, database, user, password and TLS settings; do not
  combine a connection URI's SSL query options with an explicit SSL object.
  Reject unapproved targets and production use. Do not inherit ambient PGHOST,
  PGUSER, PGPASSWORD, PGSSLMODE or PGOPTIONS as configuration defaults.
- Require CA-chain **and hostname** verification, with the exact pooler hostname
  as the expected identity/SNI and `rejectUnauthorized: true`. Load the reviewed
  provider CA; use TLS 1.2 or newer. Never fall back to plaintext or accept all
  certificates. Track CA source, fingerprint, expiry and rotation verification.
- Future initial limits: connection acquisition 5 seconds, database statement
  timeout 10 seconds, lock timeout 3 seconds, idle-in-transaction timeout
  15 seconds, idle pool lifetime 30 seconds. These are proposed bounded limits,
  to verify against the chosen driver/pooler and workload, not current settings.
  A response deadline alone does not cancel a database mutation: confirm actual
  cancellation or discard the connection and treat the outcome as unknown.
- Use parameterized unnamed queries. Each existing mutation routine is atomic
  within its statement. Multi-statement transactions must use one checked-out
  client and always release/destroy it appropriately; never split them across
  `pool.query` calls. No session identity GUC or persistent SET ROLE is allowed.
- An interrupted acknowledgement does not prove rollback. Reconcile/retry with
  the **same operation UUID and payload**, never a new UUID. Keep retry attempts
  bounded; recheck owner authorization on every owner retry. Do not retry
  validation, admission, revision or payload-conflict errors as transient ones.
- Return sanitized failures. Logs may contain an opaque correlation ID, operation
  category and safe error class; omit contact data, SQL parameters, fingerprints,
  secrets, tokens and raw driver errors. Add idle-pool error handling and graceful
  shutdown. Do not log a connection configuration object.

## Execution sequence and exact acceptance evidence

Each hosted mutation below needs its own concrete authorization. A merge of this
plan does not authorize any of them, and combining steps in one approval should
name every operation and its target explicitly.

1. **Implementation PR, local only:** build the disconnected transport and validate
   its explicit configuration, secret redaction, timeouts, shutdown and failure
   paths. Exercise the actual driver against an isolated TLS-enabled PostgreSQL
   fixture: trusted host succeeds; wrong hostname, untrusted CA, expired certificate
   and a non-TLS server fail. Existing plain-loopback tests are not this evidence.
   Prove ambient PG variables cannot redirect it and pools cannot cross roles.
2. **Testing-project hardening review:** identify current DB consumers, record
   project health and SSL enforcement, and approve enabling enforcement on the
   exact testing project. It can reboot the database and interrupt Auth/other
   consumers. Schedule the interruption, read back the setting, verify recovery
   and reject a non-SSL login. Supabase documents enforcement on both shared-pooler
   legs; do not infer that from a client handshake alone. Review network egress
   allowlists separately; do not guess an IP or change Data API exposure settings.
3. **Schema application review:** recheck exact project identity/version,
   same-named objects, grants, exposed schemas and advisors; review the migration
   bytes/hash and explicit testing-only session gate. The corrected draft's
   SHA-256 is `4C5B7347488A02DC8A12C0BB183FA8DCBCB7B5F6DF48B4E533EBB43BCAEBD6BF`.
   Execute only after exact approval. Check transactional completion, all four
   FORCE-RLS tables, routine owners/search paths/grants and temporary membership
   removal. On unexpected platform restrictions stop, preserve the error without
   secrets, and revise/test the draft; do not widen runtime privileges.
4. **Dedicated-login review and isolated smoke:** approve exact login creation,
   grants and secret placement. Before owner seeding, authenticate both through
   the actual pooler with the real driver, record safe role/database identity and
   inspect privileges. Prove both deny direct reads/writes, ownership escalation,
   other-role routines and generic API access. Verify read/decision routines deny
   when owner configuration is absent; prove TLS-negative cases with no data.
   If a fictional hosted mutation is needed, first approve its exact sample,
   owner seed, audit/receipt effects and cleanup approach. There is no automatic
   deletion of append-only history. Record both passes and untested cases.
5. **Owner-seed and workflow review:** verify the single owner UUID against fresh
   Auth and current admission; approve the exact configuration seed separately.
   Run approved synthetic submission/review/retry checks without inviting anyone
   or granting workspace access. Repeat owner revocation/stale-session tests in
   an isolated fixture; do not suspend the real owner to test denial.
6. **Real-intake review:** finish privacy identity/policy/authorization, retention
   redaction/backup rules, rights handling, minors and distributed abuse controls.
   Approve route wiring, admission behavior and activation separately. Existing
   previews remain fictional until then. No deployment is included in this plan.

Keep a dated evidence record identifying the commit, target, approver, operations,
safe results and remaining gaps. Do not attach credentials or raw application data.

## Stop, recovery and credential rotation

Keep intake disabled on any failure. Close app pools before maintenance. Revoke
the affected runtime access and terminate its database sessions through a reviewed
administrator operation when credential compromise is suspected; NOLOGIN or
password rotation alone does not close established sessions. Check pooler behavior
and retained connections explicitly. Never grant admin access to restore service.

For planned rotation, prepare the exact replacement-login/grant/secret change for
review, verify the replacement with harmless permission checks, switch one pool at
a time, drain old connections, then revoke and retire old access. Do not silently
return to a compromised credential. Update evidence without retaining old secrets.

Do not automatically DROP tables, roles or audit records. Preserve partial-state
evidence and investigate whether a failed acknowledgement committed. Re-enabling
non-SSL access is not an automatic recovery step; pause affected clients and obtain
review of any security-setting reversal. No destructive down migration is provided.

## Documentation verification

Reviewed the Supabase changelog and current connection/SSL docs on 2026-10-31.
The announced HTTP API CBC-cipher removal is separate from PostgreSQL transport;
the driver plan requires modern TLS and does not pin legacy ciphers. No provider
upgrade or HTTP Auth setting was changed. Recheck the docs immediately before
implementing or performing hosted operations.

Sources: [connection modes, custom usernames and certificate verification](https://supabase.com/docs/guides/database/connecting-to-postgres),
[SSL enforcement, both pooler legs and reboot](https://supabase.com/docs/guides/platform/ssl-enforcement),
[node-postgres TLS and connection-string precedence](https://node-postgres.com/features/ssl),
[node-postgres transactions](https://node-postgres.com/features/transactions),
[HTTP API cipher change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).
