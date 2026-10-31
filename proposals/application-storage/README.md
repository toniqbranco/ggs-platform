# Application storage — applied testing baseline, disconnected adapter

**Current status:** the owner separately approved the corrected SQL for testing,
and it was applied on 2026-10-31. All four tables are empty; no dedicated logins or
owner seed exist. See the [applied revision and evidence](../../docs/testing-storage-status.md).
Freeze that SQL file; its original UNAPPLIED comment is historical. The preparation
notes below describe the original proposal boundary and do not undo that dated
approval or authorize another application.

This increment prepares a migration and server-only adapter prototype. **It does
not itself authorize hosted SQL or enable live intake.** No app route/startup module imports the
proposal. No production database driver, connection URL, credentials, accounts, invitations,
admission grants, cleanup jobs, or deployment are added to the application.

Read-only inspection of approved testing project `rchxnmpsxfbsicthasxn` reports
PostgreSQL **17.11**. Its security advisor has an existing
[leaked-password protection disabled warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
GG’s currently uses email links. No Auth settings changed.

## Files and application boundary

- [CLI-generated SQL](supabase/migrations/20261031053908_application_review_storage.sql)
- [Adapter prototype](adapter.ts)
- [Local-only transport prototype](transport.ts) and [verification limits](../../docs/isolated-storage-transport.md)
- [Embedded PostgreSQL tests](../../tests/storage/application-storage.test.ts)

Checksum-verified official Supabase CLI **2.122.0** generated the name offline.
It was not authenticated, linked, pushed, or used to start a stack. This nested
proposal directory is outside the root migration path. CI does not apply SQL.
The script also aborts unless a reviewer deliberately sets its session gate.
That tripwire is not authorization or project-identity verification.

## Proposed schema and permissions

Private schema `ggs_pilot` contains four records:

| Table                    | Purpose                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review_configuration`   | Exact selected owner UUID/version. No seed is included; absence denies all routines. Runtime roles cannot modify it.                                    |
| `applications`           | Bounded contact/profile fields, locale, review state, revision, decision actor/time/reason.                                                             |
| `application_events`     | Append-only submission/decision history, without contact text or tokens. Actor UUIDs have no Auth FK so account deletion cannot cascade-delete history. |
| `application_operations` | Unique idempotent receipts, including duplicate-contact requests that must not create another application/event.                                        |

The receipt ledger is the additional table required beyond the three-table concept.
It stores SHA-256 request fingerprints. These are sensitive, potentially guessable
pseudonymous data, not encryption/anonymization. Receipt growth and retention need
review before intake; no cleanup job exists.

Four roles are NOLOGIN/NOBYPASSRLS: table owner, restricted executor, intake, review.
Ownership/execution are separate. Intake can execute only submission. Review can
execute only list/history/decision. Entry roles have no table grants or executor
membership. General API roles have explicit schema/table/function revocations,
including broad inherited default ACLs. All four tables enable and FORCE RLS.

Private SECURITY DEFINER mutation routines are needed to prevent direct updates
without audit events. They use a non-login executor with limited table grants,
empty fixed search paths, qualified objects, parameterized data and restricted
EXECUTE grants. The executor has no schema CREATE privilege after migration, and
no event UPDATE/DELETE grant. Never provision executor login credentials or grant
its membership to runtime roles. Database administrators retain privileged access.

## Server and transaction contract

Recommend separate intake/review runtime credentials through pooled Postgres.
The transport prototype accepts only an isolated loopback TLS fixture. Hosted
pooler authentication, custom-role provisioning, actual hosted driver TLS and
credential rotation remain unverified. Current environment
rules still reject privileged Supabase API keys; no service-role shortcut is added.

The [testing connection plan](../../docs/testing-connection-plan.md) selects a
proposed session-mode approach for the local pilot and defines driver verification,
two dedicated login boundaries and the exact review sequence. Hosted custom-role
authentication remains untested; a credential-free handshake is not that evidence.

The injected-query prototype repeats validation, parameterizes SQL, sanitizes
errors and strips internal contact keys/fingerprints/actor IDs from output.
Every owner read/decision freshly verifies Auth, exact owner identity and current
admission. Actor ID comes from verification, never form input. SQL compares it with
owner configuration. The server credential attests identity; a leaked review
credential could impersonate the configured owner. RLS does not remove that trust.
Identity is an explicit routine parameter; there is no pooled session identity GUC.

Intake returns the same receipt for new, active-contact duplicate and exact retry
requests. It exposes no application ID/account/approval status and never overwrites
an existing contact. Contact normalization trims/lowercases and preserves dots/plus
tags. Submitted contact data does not prove address ownership.

Operation UUIDs are uniquely claimed in the same transaction as the result.
Changed-payload retries conflict. Decisions lock the application and require pending
state plus expected revision. Terminal decisions advance to revision 2, append the
event and persist the receipt atomically. A matching retry returns its original
revision. A failed event write rolls back the decision and receipt. No Auth writes
occur. SQL supports owner-recorded verified withdrawal; the adapter exposes only
approval/rejection. No withdrawal-verification workflow is implemented.

## Verification and limits

`pnpm test:storage` runs **15 tests** against ephemeral PGlite **0.5.11**, PostgreSQL
**18.6**, with fictional `.invalid` data. The actual draft, PL/pgSQL, constraints,
permissions, FORCE RLS and adapter execute locally. The pinned development package
was more than seven days old. `pnpm test` includes this suite; no secrets are needed.

Tests cover missing owner configuration, duplicate/retry handling, changed payloads,
terminal/stale decisions, audit rollback, direct-write/escalation denial, general API
role denial despite broad default ACLs, fresh Auth/suspension, bounded cursor reads,
output redaction and sanitized failures. The ephemeral test harness changes session
authorization and explicitly restores its original superuser; SET ROLE alone from
a superuser would not test a restricted login. This is not Supavisor behavior.

**PGlite has one connection and a different PostgreSQL version.** Its tests alone
do not prove simultaneous races or PostgreSQL 17 compatibility. The subsequent
[native PostgreSQL 17 verification](../../docs/postgres17-verification.md) runs 12
storage cases with genuine restricted logins and overlapping transactions, plus
12 [local transport cases](../../docs/isolated-storage-transport.md).
Hosted pooler/TLS behavior, real credential provisioning and managed migration-user
permissions remain separate checks before applying anything live.

The [managed-style migration correction](../../docs/managed-migration-compatibility.md)
now tests the proposal through a non-superuser with role/database creation rights.
Temporary ownership grants are revoked before commit; runtime role permissions
do not expand. The original superuser-only setup missed this case.

## Gates and rollback

`PILOT_APPLICATIONS_ENABLED` defaults to `false`; true is rejected at startup.
No endpoint enables intake. The existing fictional public/private UI stays intact.
A proposal merge does not approve SQL application, owner seeding, role provisioning,
credentials, or real personal-data collection.

Before live schema: retain passing PostgreSQL 17/multi-connection evidence, verify the exact
testing target and schema exposure, recheck schema/grants/advisors, and obtain exact
schema/role approval. Seed only the separately verified owner through an approved
operation; no first-user bootstrap. Existing same-named objects cause failure/review,
not replacement. No data backfill or migration-history application has happened.

Rollback first keeps intake disabled and revokes provisioned runtime access. Do not
automatically DROP data-bearing objects; preserve data for separately reviewed
recovery/retention. Migration failure is transactional. No destructive down script
is included.

Before live intake: approve ES/EN privacy/retention and verified correction processes,
distributed abuse controls and receipt/error behavior; review/wire the actual server
transport and routes. Draft retention selections alone do not authorize collection,
scheduled deletion or publication. No invitation sending, account activation, later business modules or
deployment is included.

Retention is not implemented by this draft. Its restrictive foreign keys and
required contact fields mean a purge cannot simply delete the application or set
contact columns to NULL while retaining audit history. Before collecting real
data, review a maintenance/redaction procedure or separate contact-data model,
including receipt fingerprints, database backups, and verified deletion requests.

Sources: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[API grants/exposure](https://supabase.com/docs/guides/api/securing-your-api),
[PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[PGlite](https://pglite.dev/docs/about).
