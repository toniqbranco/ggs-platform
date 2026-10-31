# Testing storage baseline — applied, disconnected

On 2026-10-31, the owner separately approved SSL enforcement and the first
application-storage schema setup in the designated GG-livestream testing project.
These hosted operations are complete. They are separate from merging proposal PRs
and do not approve later credentials, owner seeding, intake or deployment.

## Applied revision

The provider recorded migration **20261031201223**, name
`application_review_storage`. The source is the corrected SQL in
`proposals/application-storage/supabase/migrations/20261031053908_application_review_storage.sql`,
SHA-256 `4C5B7347488A02DC8A12C0BB183FA8DCBCB7B5F6DF48B4E533EBB43BCAEBD6BF`.
The source timestamp names the original offline proposal; the provider assigned
its own execution timestamp. Do not replay it to reconcile those names.

The invocation deliberately set `ggs.reviewed_storage_proposal='testing-only'`
with SET LOCAL immediately after the candidate's BEGIN, before its existing guard.
DDL was otherwise unchanged. Private delivery records retain the submitted SQL,
preflight, results and screenshots. No credentials or personal records were used.

**Freeze the applied SQL.** Its UNAPPLIED comment records its original status;
this dated status document supersedes that label for the testing target. Do not
edit the file to change its header/checksum or rewrite deployed migration history.
Future schema changes need a new generated migration and separate review.
The source stays quarantined; this does not enable root CLI push or deployment.

## Verified result

- Exactly four private tables: review_configuration, applications,
  application_operations and application_events. All had zero rows, including
  owner configuration. Correct table/schema ownership, RLS and FORCE RLS verified.
- Four expected NOLOGIN roles, no superuser/BYPASSRLS/role creation/database
  creation/replication attributes. Intake/review groups have no executor/owner
  membership. Temporary migrator grants were removed; inherited/SET ownership
  access is false for the migration actor. The trusted creator retains its
  administrator role-management authority as documented in the original design.
- Four expected executor policies and six routines with correct ownership and
  fixed empty search paths. Intake can execute submission only; review can execute
  decision/list/history only. Neither has direct table or schema CREATE rights.
- PUBLIC has no private ACL entries. Effective anon/authenticated/service_role
  schema, table and routine privileges are false. The executor cannot CREATE in
  the schema or UPDATE/DELETE audit events.
- Dashboard Data API reports 0/4 tables and 0/6 functions exposed; the private
  schema is excluded. Automatic new-table exposure remains unchanged, so future
  migrations still need explicit exposure/default-grant verification.
- Provider metadata is ACTIVE_HEALTHY and post-application read-only SQL works.
  The existing leaked-password-protection warning remains; no new listed security
  advisor finding. That Auth setting was not changed.
- Separately approved SSL enforcement is ON; verified TLS succeeds and plaintext
  startup is refused on both pooler ports. Auth health returned 200 after that
  setting change. This is not a full real-owner sign-in/refresh/sign-out test.

## What remains disconnected

No dedicated runtime LOGIN roles/passwords, owner configuration seed, application
rows, Auth users/invitations, admission updates, route wiring, cleanup jobs or
deployment were added. The website still imports no storage proposal, the driver
remains a development dependency, and `PILOT_APPLICATIONS_ENABLED=true` is rejected.
No owner or streamer permissions follow from creating database permission groups.

Next follow the [connection plan](testing-connection-plan.md): review hosted
target-bound driver configuration/secret storage and separately approve exact
dedicated login provisioning and authenticated permission checks. Do not relax
the [isolated transport](isolated-storage-transport.md) target restrictions as an
operational shortcut. Owner seed and any synthetic hosted writes are later exact
approvals. Privacy, retention/redaction/backups, rights, minors and abuse controls
still precede real applications. No account invitation is implied by approval.
