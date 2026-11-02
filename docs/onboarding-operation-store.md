# Durable setup provider operations — isolated only

This stage replaces the HTTP fixture's in-memory operation store with a restricted
PostgreSQL store. It is not connected to website routes or hosted Supabase. The
existing magic-link sign-in and disabled password/profile previews are unchanged.

## Files and execution boundary

- [Unapplied additive migration](../proposals/streamer-onboarding/supabase/migrations/20261102225344_provider_operation_store.sql).
- [Server-only store](../proposals/streamer-onboarding/operation-store.ts), injected
  into the [SDK gateway](../proposals/streamer-onboarding/fixture-gateway.ts).
- [Native PostgreSQL tests](../tests/postgres17/onboarding.test.ts) and
  [store boundary tests](../tests/storage/onboarding-operation-store.test.ts).

The two previously reviewed migrations are unchanged. The new migration requires
`ggs.reviewed_provider_operations='isolated-only'`, the prior onboarding schema,
and a fresh `ggs_ob_proof` role. It fails rather than adopting an existing role.
It creates two private FORCE-RLS tables, nine narrow functions/helpers and one
NOLOGIN/NOBYPASSRLS permission group. Temporary migration memberships are removed
before commit, including when the migration runs as a non-superuser. Broad API
default privileges are revoked on the new objects.

The new proof group can only claim, read evidence, verify a claim and mark an
uncertain result. It cannot query tables, read profiles, change membership, issue
invitations, accept setup steps or resolve uncertainty. Owner resolution belongs
to the separate existing operator group. Neither group is a public Data API role.
The executor has no DELETE permission and no UPDATE/DELETE on provider events.

The store requires explicit `isolated-fixture` mode, APP_ENV=test and a nonproduction
runtime on construction and every call. Its channel is injected; it loads no
credentials and opens no connection. Fixed parameterized SQL, strict results and
sanitized errors keep provider secrets and database details out of responses.
The actual SDK still uses mandatory fake fetch against a reserved `.invalid`
provider. No production adapter or environment switch is added.

## Claim and proof rules

The database locks the binding before its operation and the approved parent
application. No database lock spans a provider request. A new claim checks the
current configured owner, current approved application revision, assigned subject,
streamer role, pending membership, exact binding revision and required step.
An unaccepted expired invitation, revoked binding or completed password step cannot
claim. A configured owner cannot become a streamer through this path.

A claim contains a random internal capability returned only to its first caller.
Concurrent requests receive an in-flight marker without that capability. A unique
live binding/step constraint blocks replacing the operation ID to repeat an effect.
Neither the capability nor proof ID is accepted from an HTTP body or returned by
the HTTP response. They are internal metadata, not Auth credentials.

The gateway performs the fake provider action once and verifies the resulting
fresh identity. Completion checks the original capability, unexpired five-minute
lease and current step eligibility before committing evidence and an audit event
atomically. Operation IDs, binding/subject UUIDs, revisions, timestamps and opaque
proof/review IDs are retained; passwords, invitation token hashes, sessions,
provider response bodies and secret-derived fingerprints are not stored.

A completed secret-bearing request remains reconciliation-required. The separate
command-only receipt flow reads the verified proof for the fresh matching subject,
then records the existing setup transition. It acknowledges an earlier operation;
it does not claim a new password was applied. A lost completion acknowledgement
cannot downgrade committed proof or create another provider effect.

## Uncertain outcomes and owner review

Timeouts never renew or steal a claim. The next claim/completion check persists
reconciliation when the lease expired or the binding step changed. Cleanup can
mark uncertainty after revocation without granting evidence. Repeating cleanup
is harmless and never erases verified proof. No automatic retry, reset, deletion,
scheduled recovery or provider idempotency guarantee is implemented.

The SQL-only `resolve_provider_step` primitive requires the current configured
owner UUID through a trusted operator channel, an exact operation version, unique
review ID and one decision. It is not mounted as a route and has no website UI or
operator script in this stage. PostgreSQL runtime groups are trusted server
capabilities, not end-user identities: a later recovery adapter must obtain the
actor from fresh server getUser plus active owner admission, never a request body.

- **verified:** only after external provider evidence confirms the intended effect
  for this subject and operation. Requires an opaque evidence UUID and current
  step eligibility. It records proof without sending another provider request.
- **no-effect:** only after external verification establishes that no effect
  occurred **and the original worker/provider request cannot still complete**.
  Quiesce/terminate the old worker and review provider state before using it. A
  timeout or missing local receipt is insufficient. This preserves the old record
  as abandoned and permits a new operation if normal preflight still succeeds.

Both decisions append an audit event, compare versions, support the exact same
review retry and fence stale database writers. A late worker cannot overwrite the
owner's database decision; this does not cancel a request already running at the
Auth provider. Safe provider-state inspection/quiescence and a fresh-owner adapter
remain required before any real recovery use. There is no global unlock control.

## Evidence and next gate

Native tests use disposable PostgreSQL 17, generated local-only logins and fictional
identities. They cover actual SDK/HTTP setup with durable storage and new store
instances, concurrent claims, new-ID bypass denial, expiry, stale approval/step,
wrong subject/capability, lost acknowledgements, revocation, versioned owner
resolution, stale writers, minimal history and atomic audit rollback. Broad API
and existing runtime groups cannot call the proof functions; proof cannot resolve
or activate membership. Import tests enforce the server-only boundary.

Stop at this PR review. Next prepare the fresh-owner recovery adapter and its
provider-state/quiescence contract before reviewed page/request integration.
Hosted migration application, credentials, invitation delivery, real password
changes and profile collection each remain separate review gates. Profile
retention/linkage/backup decisions, verified privacy rights and password-recovery
policy remain unresolved prerequisites. The earlier real-owner email/callback
issue is still unverified. Public submissions and workspace access stay closed.
No hosted resources, data, Auth settings or deployment change in this stage.

References: [Supabase function privileges and security](https://supabase.com/docs/guides/database/functions),
[private schemas and RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PostgreSQL 17 row locks](https://www.postgresql.org/docs/17/explicit-locking.html).

The [owner recovery adapter review](onboarding-owner-recovery.md) documents the
next isolated increment, including explicit owner preparation of expired claims
and the trusted provider-state/worker-quiescence evidence contract. Its inspector
is simulated; it enables no real recovery or website endpoints.
