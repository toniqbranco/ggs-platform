# Isolated PostgreSQL 17 verification

This suite tests the unapplied storage proposal on real PostgreSQL
17.11 with independent authenticated connections. No website routes, admission
rules, Supabase resources or live configuration change.

## Coverage

`pnpm test:storage:pg17` runs 12 cases:

1. Actual restricted LOGIN identities cannot read/edit private tables, alter owner
   configuration, escalate to executor or create schema objects.
2. Eight simultaneous submissions for one contact create one application/event.
3. Simultaneous matching submission-operation retries create one durable receipt.
4. Changed-payload reuse of one operation UUID has one winner and one conflict.
5. Competing owner decisions commit one terminal decision; the loser rolls back.
6. Matching decision retries return the same revision without extra events.
7. A simulated dropped application acknowledgement **after commit** can be retried
   for intake/decisions. This does not inject a network failure inside COMMIT.
8. An actually terminated blocked backend rolls back intake; a new connection retries.
9. Other connections cannot read an uncommitted decision or its audit event.
10. An injected audit failure rolls back intake and decisions on native PG17.
11. Wrong-owner and fresh suspended/streamer requests cannot inherit authority from
    preceding requests on the same reused backend.
12. A managed-style non-superuser can apply the corrected draft, and temporary
    ownership SET/INHERIT rights are removed afterward.

Race cases hold a real row/table lock until `pg_stat_activity` shows at least two
distinct waiting backend PIDs. Releasing that barrier creates overlapping database
transactions. Connection, statement and barrier waits are bounded. Transactions use
checked-out clients with finally-block cleanup, following
[node-postgres guidance](https://node-postgres.com/apis/pool).

## Test-only safety boundary

The suite is opt-in, outside ordinary `pnpm test`. It requires `APP_ENV=test`,
`GGS_PG17_TEST_ACK=disposable-local-postgres17` and a disposable
`GGS_PG17_TEST_PASSWORD` of at least 16 characters. `GGS_PG17_TEST_PORT` accepts only
55437, also its default. Host `127.0.0.1`, base database `ggs_pg17_isolated_test`,
user `ggs_test_admin`, local plaintext transport and a fixed UTC startup option are
hardcoded. No `.env.local`, connection URL, PGHOST or PGOPTIONS can redirect it.
Unit tests check refusal of implicit/production/arbitrary-port configuration.

Before DDL, the harness verifies the server major version, current database/user
and absence of pre-existing fixture roles. It creates a random per-run database,
applies the exact proposal, and seeds only synthetic owner/contact records.
Separate generated-password intake/review/anonymous logins are not superusers and
cannot create roles or bypass RLS. All contact addresses use `.invalid`.

Connections are closed and only the run's created database/roles are dropped.
The outer fixture controller is a disposable local superuser for database/role
cleanup. The actual migration now runs through a separate non-superuser matching
managed-style role attributes. See the [compatibility correction](managed-migration-compatibility.md).
Managed-platform provisioning and policy guards remain untested on the hosted project.

## Native Windows and CI evidence

The local run used PostgreSQL **17.11**, EDB portable archive **17.11-5**, from the
[Windows archive source linked by PostgreSQL](https://www.postgresql.org/download/windows/).
Only server tools were extracted into workspace tooling. The temporary cluster
used generated fixture credentials, SCRAM host authentication and loopback port 55437. No Windows service was installed; stop the cluster after testing.

Download source: `https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip`.
Recorded archive SHA-256:
`80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`.
This is a recorded hash, not an independently published checksum/signature check;
the server executable is unsigned. Provenance is the official linked HTTPS source
and observed/tested version. No binaries or generated passwords are committed.

To repeat locally, create a fresh loopback PostgreSQL 17 cluster with the exact
base database/admin above, supply its disposable credential through test-only
environment variables, then run `pnpm test:storage:pg17`. Never use shared servers
or application environment files. See PostgreSQL
[initdb](https://www.postgresql.org/docs/17/app-initdb.html) and
[pg_ctl](https://www.postgresql.org/docs/17/app-pg-ctl.html) for lifecycle setup.

The dedicated **PostgreSQL 17 concurrency tests** CI job creates a disposable service
using official `postgres:17.11-bookworm` pinned by manifest digest
`sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5`.
Only runner loopback port 55437 is exposed; its password is an explicitly fictional
job-local value. No project credentials or deployment permissions are present.
Runner/service disappear after the job. Quality/browser and secret checks remain.

`pg` and its types are pinned development dependencies. Application code imports
neither the client nor this harness. Fast embedded-PG tests remain server-free.

## Remaining gates

These checks close the native-PG17/overlapping-transaction evidence gaps. They do
not verify hosted Supavisor role authentication, application-driver certificate
validation/rotation, managed-platform policy guards, schema exposure or real owner
refresh/sign-out. The extra regression covers core PostgreSQL migrator attributes.
They are correctness tests, not load tests or complete distributed failure analysis.

The original PR #12 hash and the corrected proposal hash are recorded in the
[managed-migration review](managed-migration-compatibility.md). Only the unapplied
role bootstrap changed; runtime grants/routines retain the tested behavior.
Nothing is applied to GG-livestream. Privacy/retention/redaction, distributed abuse
controls, verified correction and actual server transport/routes remain live gates.
`PILOT_APPLICATIONS_ENABLED=true` is rejected. Accounts, invitations, activation,
production and deployment remain outside scope.
