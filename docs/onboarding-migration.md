# Onboarding storage: isolated migration verification

## Boundary

This increment implements the unapplied database portion of the
[invitation/profile proposal](../proposals/streamer-onboarding/README.md).
The CLI-generated [migration](../proposals/streamer-onboarding/supabase/migrations/20261102061549_streamer_onboarding.sql)
is tested only in freshly named disposable PostgreSQL 17 databases. It has not
been applied to GG-livestream, and no website route imports or executes it.
The existing applied application migration's SHA-256 remains unchanged.

There is no provider adapter, invitation sender, actual password setter, live
profile intake or activation. SQL password/invitation evidence is an opaque
operation UUID asserted by a trusted future server adapter, not proof that Auth
succeeded. Tests use fictional subjects and `.invalid` profile/contact details;
they create no Supabase accounts or send emails.

## What the draft creates

Five private `ggs_onboarding` tables hold invitation bindings, operation receipts,
setup progress, profiles and minimal audit events. Six NOLOGIN/NOBYPASSRLS groups
separate ownership, constrained execution, operator, setup, self-reader and
maintenance authority. Ten functions include five private helpers and five narrow
entry points. No login passwords, credentials or owner configuration are created.

| Entry point           | Allowed role and effect                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reserve_invitation`  | Operator checks the configured owner and approved application revision, serializes competing reservations and records one pending binding/operation/event. No subject is selected by a public request.              |
| `operator_transition` | Operator claims the original invitation operation, records uncertain/confirmed provider evidence, or revokes a binding. Reconciliation is explicit; an in-flight/expired claim cannot be automatically repeated.    |
| `setup_transition`    | Trusted setup connection attests the bound subject and verified invitation/password evidence; accepts, records password success, saves one profile, or finalizes. Each mutation checks current state and revisions. |
| `read_self`           | Self-reader returns only the specified authorized subject's current private profile and membership summary. No contact-email copy, other creator, audit internals or authority editing.                             |
| `redact_profile`      | Maintenance connection, attesting the configured owner, can redact a revoked binding's fictional profile only after the draft 90-day interval. No worker/schedule or live deletion is enabled.                      |

All tables enable and FORCE RLS. Entry groups have function-only access and cannot
read/write tables, call internal helpers, inherit executor ownership, alter events
or gain schema CREATE. General API roles and the existing intake/review groups
receive no access, even with broad global defaults. Executor owns the private
functions with an empty search path and exact table privileges; it cannot update
or delete audit events. The migration grants it no DELETE permission.

The new executor reads only application ID/revision/state/approver and configured
owner UUID from the existing schema. Two SELECT policies and one locking policy
are added there; the old migration file is not edited. PostgreSQL requires UPDATE
privilege on a column to take a row SHARE lock, so `UPDATE(id)` is narrowly granted
with an UPDATE policy whose `WITH CHECK(false)` forbids **every actual update**.
Native tests prove locking works while application writes and email reads fail.
The existing intake/review credentials gain no new privilege.

Managed-style migration runs with a non-superuser role having database/role
creation rights. Temporary inherited ownership grants are removed before commit;
tests prove the migrator cannot keep owner/executor access afterward. Broad
default grants to PUBLIC/API roles are explicitly revoked. Pre-existing same-named
objects cause failure rather than adoption or replacement.

## Ordering, retries and failure behavior

Reservations serialize by application, then lock/recheck the current approved
application row. Other setup/operator writes lock the binding before the parent
application check. No routine writes the application. Future parent-state writers
must respect a compatible ordering; the test models an external parent update
and confirms the waiting reservation rejects the now-rejected application.

Exact operation retries compare actor, binding, purpose, revision and a database-
computed normalized request digest. A changed request conflicts. Current owner,
subject, membership and approval checks run before successful receipts are
returned. Revocation therefore blocks old successful setup receipts and self-reads
on reused connections. Unused invitation expiry denies acceptance; an already
accepted invitation does not expire just because its original link does.

The invitation claim lease is five minutes in this isolated draft. Normal issued
evidence requires that live lease; an expired or uncertain operation requires the
explicit reconciliation branch using the same original lease identity and verified
provider evidence. This is not permission to resend or make another account.
The draft caps supplied unused invitation expiry at one day; the future adapter
must also honor the provider's actual shorter expiry. These are isolated guards,
not hosted Auth setting changes or a selected production invitation policy.

Profile saving is first-setup-only: a current password receipt, pending membership,
matching binding revision and profile revision zero are required. The profile,
progress, audit event and committed receipt are atomic. Profile completion alone
leaves membership pending. Finalization changes the private membership row only;
it grants no owner/admin role, writes no Auth metadata and opens no workspace.

Revocation is restrictive and may overtake an intervening setup revision. It
accepts an older positive expected revision up to the current one, while all
progress/activation writes require an exact revision. This prevents concurrent
finalization from defeating an owner revoke. Tests queue both request orders on
independent server backends; the final state is revoked/suspended in both cases.
An audit failure rolls back profile/progress/receipt updates and redaction together.

The TypeScript intent hash and SQL receipt digest have **different internal
encodings and envelopes**. Neither is a browser credential; do not compare them
as interchangeable hashes. The future adapter must map reviewed commands to SQL,
let the database compute its digest, validate outputs and expose no fingerprints.
SQL action/event names are also internal and require an explicit adapter mapping.

## Draft redaction and remaining retention work

The isolated routine clears profile values and prior payload/provider fingerprints
for revoked bindings at least 90 days old. Its own minimal redaction receipt allows
an exact retry. Binding IDs, subject linkage, progress references, operation identity
and event history remain; this is **not complete erasure or anonymous history**.
The draft does not schedule unused-invitation expiry, purge one-year history,
resolve verified rights, process backups/exports or redact the earlier application
tables. The existing hosted fictional application/history is untouched.

The owner has not approved a final profile-retention policy. Before real profile
collection, finish expiry/offboarding policy, linkage/history purge, restore-time
redaction and rights procedures, with tests and separate review. Do not turn this
fictional test routine into a live maintenance job or claim retention is complete.

## Verification and next gate

`pnpm test:storage:pg17` automatically includes
[the new native suite](../tests/postgres17/onboarding.test.ts). It uses the existing
opt-in [loopback harness](postgres17-verification.md), never `.env.local` or a hosted
database URL. Tests create temporary login fixtures only in that disposable local
cluster, end their sessions, remove their database/roles and preserve hosted state.

Coverage includes the guard, managed migration and privilege restoration, FORCE
RLS, real restricted logins, owner/application/subject checks, uniqueness, claim
ambiguity/expiry, exact retries/conflicts, profile validation and separate activation,
audit rollback, own-profile reads, revocation on pool reuse, draft redaction/rollback,
parent approval changes and overlapping reservation/profile/finalization/revocation
transactions. Provider verification/email and cross-service reconciliation remain
unproved; no simulator is presented as evidence of hosted behavior.

Stop for this PR review. Next prepare the server-only persistence adapter and
fixture-backed Auth/setup integration, default off, with strict verified identity,
error redaction, revision/receipt mapping and provider-failure reconciliation.
Outstanding retention work still blocks real profile collection. Any hosted SQL,
role/credential change, recipient/account setup, invitation/email, Auth setting or
deployment needs its own exact review. The previous real-owner callback check
remains unverified and is not fixed by this database-only stage.
