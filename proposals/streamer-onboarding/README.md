# Invitation and private-profile persistence proposal

## Status and evidence

This is the next design increment after merged PR #25, implementing the contract
portion of stage two in the [onboarding plan](../../docs/streamer-onboarding-plan.md).
It supplies [executable request/receipt/audit contracts](contract.ts) and isolated
fictional [unit cases](../../tests/unit/onboarding-storage-contract.test.ts).
The subsequent [isolated migration verification](../../docs/onboarding-migration.md)
adds an unapplied SQL draft and real PostgreSQL 17 tests. A subsequent
[isolated server-only adapter](../../docs/onboarding-adapter.md) exercises fixture
identity/evidence against it. The next [SDK/HTTP fixture](../../docs/setup-http-fixture.md)
adds fake-provider effects and request orchestration. No hosted provider operation or public route integration
is added. No hosted schema/grant,
account, invitation, password, profile record, secret, setting or deployment changes
are performed.

The TypeScript tests validate contracts. The subsequent native suite verifies
SQL permissions, transactions and concurrent locks in disposable local databases;
it does not verify provider email or cross-service crash recovery. Fixture-backed
Auth remains a later increment.
The frozen application-storage migration must not be edited or replayed.

## Identity and invitation binding

1. The owner explicitly selects an approved application. A fresh server `getUser()`
   result must pass the current owner-only management check. A caller cannot submit
   an email, account subject, role or metadata object as invitation authority.
2. Reserve an operation UUID and binding UUID against the application's current
   approved revision and configured owner. Recheck that revision/state/approver
   under a database lock. This reservation creates no account or active membership.
3. Resolve the target contact from that application on the privileged operator
   side. Initial scope permits a new invited identity only. An already existing
   Auth identity stops for a separate attach/reinvite review; never overwrite,
   merge or grant access to an account by matching its email alone.
4. A separately authorized operator claims the reserved operation using a durable
   lease and performs the provider invitation outside the database transaction.
   No Auth administrator credential belongs in the Next.js website runtime.
5. Record the exact returned Auth UUID only after checking the intended project,
   current application/contact, operation correlation and absence of another live
   binding. An invitation request receipt has `subject: null`; its committed result
   has `resolvedSubject`. Never substitute the owner's UUID as the invited subject.
6. Accept only provider-verified invitation evidence bound to that subject and
   issued invitation, then recheck current application approval and unused expiry.
   A normal magic-link success, editable metadata or query flag is insufficient.
   The acceptance/exchange mechanism is not implemented or selected by this PR.

Normalize contact comparison by trimming/lowercasing only, preserving dots/plus
tags consistently with existing intake. Do not duplicate contact email in profile
or audit rows. An exact email match is a consistency check after verified identity
binding, not proof of account ownership. Contact correction requires its own
verified process and invalidates an unaccepted invitation targeting the old contact.

Account-created, email-sent, email-verified, invitation-accepted, password-confirmed,
profile-saved and membership-active are distinct facts. No step implies the next.
Do not use account creation time or the existence of an Auth password hash as a
password-step receipt. Never query/export provider password hashes.

## Proposed storage layout

Use a new unexposed `ggs_onboarding` schema. Names below are design targets, not
objects that have been created. Generate a new migration through the reviewed CLI
workflow later; do not add tables to the applied migration file.

| Table                   | Proposed contents and constraints                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invitation_bindings`   | Binding UUID; application FK/reviewed revision; configured approving owner UUID; nullable Auth subject until provider result; lifecycle `reserved/issued/accepted/expired/revoked`; issued/expiry/accepted/revoked timestamps; current membership `pending/active/suspended`; explicit streamer-only role; monotonic binding revision. Unique live binding per application and per non-null subject; revocation leaves history. |
| `setup_progress`        | Binding PK/FK; resolved subject; password-success operation reference and timestamp; saved profile revision; completion/finalization references; monotonic progress revision. No password, token, hash or client completion flag. Subject must match the binding.                                                                                                                                                               |
| `streamer_profiles`     | Binding PK/FK; resolved subject; display name (2–80), country (2–80), platform `tiktok/twitch/youtube/other`, HTTPS creator-profile URL (max 300, no embedded credentials), preferred locale `es/en`; revision and lifecycle timestamps. No email copy, phone, ID, payments or public profile publication.                                                                                                                      |
| `onboarding_operations` | Operation UUID PK; purpose; actor UUID; request subject (null for an initial invite); binding FK; sensitive normalized-request fingerprint; `reserved/in-flight/reconcile/committed/rejected` state; lease/attempt evidence; safe result revision/resolved subject and timestamps. Durable unique claim, not an in-memory retry cache.                                                                                          |
| `onboarding_events`     | Event UUID and ordering key; binding/operation references; event kind; actor UUID; nullable subject only before resolution; revision/time. Unique event identity per operation/kind where one transition is expected; no contact/profile values, passwords, links, provider errors or fingerprints.                                                                                                                             |

Use constraints for valid lifecycle/timestamp combinations, positive bounded
revisions and cross-record subject consistency. Index foreign keys and lookups by
subject/live binding, application/live binding, operation and due retention state.
Preserve data on referenced-object deletion (`RESTRICT` rather than implicit cascade).
Cross-schema application privileges and migration-role ownership must be tested
under managed-style non-superuser migration rights, not assumed from local postgres.

## Permission design

All proposed tables enable and FORCE RLS. Revoke general API access and broad
default ACLs; do not expose the new schema through Data/GraphQL APIs. A role named
`authenticated` is not self-only authorization. No editable `user_metadata` or
unrefreshed JWT snapshot supplies roles, subjects or setup receipts.

Propose separate NOLOGIN/NOBYPASSRLS groups for data ownership, constrained
execution, operator lifecycle, setup mutation, self-read and maintenance. No
runtime inherits ownership/executor privileges or gains schema CREATE. The two
existing intake/review logins receive **no new privileges** under this proposal.
Do not create or store runtime credentials in this stage.

| Capability                               | Proposed least authority                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner/operator invitation and revocation | Narrow lifecycle routines after fresh sole-owner verification; no public signup or delegated admin invitation authority.                                                   |
| Streamer setup writes                    | Narrow own-binding password receipt, profile and finalization routines, each with expected revisions and current status checks. No arbitrary account/role or table writes. |
| Streamer reads                           | Own profile/progress only while authorized; no application queue or other participants.                                                                                    |
| Owner review                             | Existing application queue remains as delivered; this does not add general private-profile browsing or impersonation.                                                      |
| Retention maintenance                    | Reviewed redaction routines only; cannot grant membership, invite, alter Auth or read/export unrelated contacts.                                                           |

Prefer invoker execution where possible. If private SECURITY DEFINER routines are
needed to enforce atomic audit-only writes, use a dedicated non-login executor
with exact grants, fixed empty search path, qualified objects, parameterized values
and PUBLIC EXECUTE revoked. Prove direct-table/escalation denial and run advisors
before any later hosted schema approval.

The server connection attests actor/subject from fresh identity, not request
fields; a leaked runtime credential could forge that attestation. RLS does not
eliminate that risk. Do not rely on mutable pooled session settings, a client JWT
role hint or a superuser connection. Test real restricted logins and pool reuse.

## Transaction and retry contract

For a mutation: freshly verify identity/current admission, lock the canonical
application/binding in a fixed order, recheck approval/revocation/revisions, claim
the operation, perform the allowed transition, append its redacted event and
commit the safe receipt in the same short transaction. Never call Auth or send
email while holding database locks. Acquire remaining rows consistently to avoid
deadlocks, use bounded timeouts and preserve evidence on ambiguous failures.

An exact retry compares operation UUID, actor, request subject, binding, purpose
and canonical normalized fingerprint. Changed values or another actor conflict.
Fresh revocation/identity checks happen **before** revealing a prior receipt.
A replay returns that safe receipt; it does not repeat a transition or grant a
session. In-flight or uncertain provider outcomes require reconciliation, not an
automatic retry. `reserved` means a durable operator claim is still required;
the pure classifier does not claim a lease or authorize an external call.

Fingerprints are SHA-256 of normalized bounded intent, including purpose. They
contain no password/token but remain personal-data derivatives, vulnerable to
guessing. They must not appear in application logs, browser responses or audit
projections; they require the same retention review as contact/profile data.
Canonicalization/order is versioned with the contract. Never hash raw unparsed
request objects or silently accept unknown fields.

| Failure or race                                                | Required outcome before activation                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider invitation may have succeeded, local recording failed | Mark/recover as reconciliation-required. Inspect exact operation/provider evidence; do not resend, recreate, delete or grant automatically.                                           |
| Reservation conflicts with another invitation                  | One live application/subject binding wins by unique constraints/row locks; preserve the losing operation outcome without a second send.                                               |
| Provider password update succeeds, progress receipt fails      | Keep membership pending. Reconcile with trusted operation evidence or a controlled fresh password step; no inference from profile flags or hash presence.                             |
| Profile write/audit write fails                                | Roll back profile, progress and receipt together. No partial save or activation.                                                                                                      |
| Finalization races with revocation/suspension                  | Serialize on the same binding. Earlier revocation blocks activation; later revocation leaves final state denied. No subsequent request may reactivate from an old completion receipt. |
| Auth metadata and private rows disagree                        | Fail closed for the new-streamer path; no compensating role write or permissive fallback. Preserve the owner/admin path.                                                              |

For **new streamers**, propose the private binding/progress as current activation
authority. Do not dual-write `active` to both Auth metadata and Postgres and claim
cross-service atomicity. A later feature-gated adapter must combine fresh verified
Auth identity with the private current binding, explicit streamer role and complete
setup. Version-1 owner/admin authorization stays unchanged. Existing streamer
records need a separate compatibility/migration decision; no silent conversion.
The website currently implements none of this new adapter and still rejects
pending members through the existing callback.

## Profile lifetime — draft only

Propose removing private profile details after 90 days for abandoned setup following
invitation expiry/revocation, and after offboarding plus 90 days for former active
streamers. Active profiles remain only while needed for the pilot. Keep minimal
decision/operation history for at most one year, subject to verified rights and
the separately reviewed legal/privacy requirements. These are **new draft profile
recommendations**, not an extension of the previously selected application policy.
Owner acceptance is required before real profile collection.

Retention must remove payloads, duplicate data, request fingerprints and stale
operation results together, including applicable logs/exports/backups under a
documented restore process. Preserve minimal justified decision history without
retaining contact/profile values by accident. Stable UUIDs and hashes are not
anonymous. Specify whether remaining linkage is necessary and when it is purged.
No deletion worker, schedule, erasure action or privacy-notice publication runs
under this proposal. Existing fictional application/history must remain untouched.

## Next evidence and release gates

After this PR is reviewed, prepare a new **unapplied** migration in isolation and
implement the narrow persistence routines. Prove constraints, FORCE RLS, default
ACL revocation, non-superuser setup, actual restricted-login denial, own-subject
isolation, immutable audit, exact retry/conflict behavior, stale revisions,
transaction rollback, lease ownership, concurrent finalization/revocation and
retention/redaction against PostgreSQL 17. Test provider ambiguity separately;
database transactions cannot prove email delivery or provider idempotency.

Then proceed to fixture-backed Auth/setup integration with all new behavior off
by default. A later exact testing-project review must approve schema/grants,
credentials, provider exchange/settings, recipient and email sends individually.
Recheck project exposure/advisors and migrated SQL hash at that time. No generic
"proceed" or proposal merge activates those operations. Reliable first email and
recovery remain prerequisites; the real-owner callback incident is still unverified.

Sources checked: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[database privileges](https://supabase.com/docs/guides/database/postgres/roles),
[PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html),
and the [reviewed onboarding provider references](../../docs/streamer-onboarding-plan.md#references-checked).
