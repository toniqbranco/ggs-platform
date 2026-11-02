# Owner setup recovery — isolated adapter

This stage adds the [server-only owner recovery adapter](../proposals/streamer-onboarding/owner-recovery.ts)
and a [guarded, unapplied preparation function](../proposals/streamer-onboarding/supabase/migrations/20261102234438_owner_recovery_review.sql).
It completes the orchestration boundary around the previously reviewed durable
operation store. It is not a public endpoint, page, operator script or connection
to hosted Supabase. Current sign-in and disabled setup previews are unchanged.

## Identity and operation review

The adapter requires explicit isolated-fixture mode, APP_ENV=test, nonproduction,
a configured owner UUID, an injected restricted operator channel, fresh server
getUser verification and a trusted provider inspector. It creates no SDK client,
connection, credential loader or provider fetch. Every entry point checks runtime
and a fresh verified, email-confirmed, nonanonymous user with the exact configured
owner UUID and active owner admission. User-editable metadata and request-supplied
actors cannot authorize recovery. Admin and streamer identities are denied.

`prepare({operationId})` returns only the minimal operation, binding and subject
UUIDs, step/revisions, state, lease time and previous review/evidence IDs. The new
SQL function checks the configured owner, locks the binding before its operation,
and may persist an expired claimed operation as reconciliation with one audit
event/version increment. Preparation is explicitly a possible write; it cannot
reset a claim or repeat an Auth effect. A live lease remains claimed and cannot
be resolved. Preparation is safe to repeat; failure of its audit insert rolls
back the state change. It returns no claim capability, password, token or profile.

The migration adds one private SECURITY DEFINER function under the existing
NOBYPASSRLS executor, empty search path and existing FORCE-RLS policies. Only the
existing operator group gets execute permission; proof/setup/reader/maintenance,
PUBLIC and broad API roles cannot call it. Temporary migration memberships and
CREATE permission are removed before commit. No table or role is added, and the
three previously reviewed migration files remain byte-for-byte unchanged.

## Trusted provider-inspection contract

Resolve input is strictly `{operationId, expectedVersion, reviewId, decision}`.
It cannot carry an actor, evidence UUID, claim capability, contact/profile data,
password, token, external URL or a claim that an old worker stopped.

The adapter prepares the current record and rejects a version mismatch or a
still-running claim before invoking the inspector. The inspector receives the
exact owner, review, operation, binding, subject, step and revisions. Its strict
receipt must match that full tuple and contain:

- `confirmed: true`, `workerStopped: true`, `providerSettled: true`;
- a valid observation time no more than 60 seconds old and not in the future;
- an opaque evidence UUID for verified effect, or null for confirmed no-effect.

The inspector is an injected trusted dependency, not a form or owner-checkbox
parser. Current tests simulate it. **No concrete hosted provider inspector exists
in this stage**, and no observation here establishes anything about real accounts.
A future implementation must quiesce/terminate the old worker and establish that
its provider request cannot still complete; a lease timeout does not do that.

For verified effect, establish the intended subject/step/operation from reliable
provider evidence; current user existence or a changed timestamp alone is not
proof that the specific password was applied. For no-effect, establish both absence
of the intended effect and final settlement/cancellation of the old request.
Unknown provider state, missing evidence, ongoing work, delayed responses or
unavailable provider history must stay blocked. Do not repeat invitation redemption
or set another password merely to inspect the result. No password or token-derived
fingerprints may be stored to manufacture proof.

After inspection, the adapter rechecks fresh owner identity and admission, reloads
the operation, compares the entire snapshot and checks receipt freshness again.
The final SQL function independently checks current configured owner, exact version
and verified-step eligibility. Revocation/approval changes deny verified evidence.
Database fencing cannot cancel an already-running Auth request.

A lost final acknowledgement returns reconciliation-required with no automatic
retry. An explicit exact review retry reads the stored prior decision and returns
`receipt: true`, without inspecting the provider or writing another decision.
New/conflicting review IDs cannot overwrite it. Responses contain only revision
and receipt status; raw provider/database exceptions never pass through.

## Validation and limits

[Isolated adapter tests](../tests/storage/onboarding-owner-recovery.test.ts) cover
runtime and owner restrictions, forged command fields, scoped/fresh evidence,
ongoing or unsettled provider work, stale records, revoked owner access, sanitized
failures and lost acknowledgements. The [native suite](../tests/postgres17/onboarding.test.ts)
uses restricted PostgreSQL roles and fictional provider observations to verify
expiry preparation, evidence recovery, safe exact retries, privilege denial and
atomic audit rollback. Import tests enforce the server-only boundary.

There is no global unlock, scheduler, automatic retry, real password reset, new
account, invitation, hosted SQL/settings change or deployment. The original
real-owner magic-link/browser issue is still unverified. Profile collection stays
closed pending its retention/linkage/backups and privacy-rights review. Actual
hosted provider inspection and its evidence handling require separate review.

## From here to the app

After this PR review, the next implementation milestone is **local app setup page
and request integration with fictional data**: connect the bilingual screens to
this isolated flow and test the experience in a browser, without real accounts or
hosted writes. Preserve the current live sign-in path and private HQ boundary.
That stage must specify a hard local-only gate before exposing test-only handlers.

The following milestone is a specifically approved Supabase **testing pilot**:
review unapplied SQL/grants, credentials, invitation recipient/email handling,
password and recovery policy, profile privacy/retention, then test one approved
streamer manually. Normal success can be tested without attempting uncertain
provider operations; unresolved outcomes remain blocked. Production launch is a
separate stage with release testing and explicit deployment approval, not a side
effect of completing these local milestones. No launch date is established yet.

References checked: [Supabase server verification](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
[server-controlled authorization metadata](https://supabase.com/docs/guides/auth/managing-user-data),
[function privileges](https://supabase.com/docs/guides/database/functions).
