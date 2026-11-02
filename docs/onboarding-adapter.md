# Isolated server-only onboarding adapter

This increment connects the [reviewed SQL draft](onboarding-migration.md) to a
[server-only adapter](../proposals/streamer-onboarding/adapter.ts), using injected
identity/evidence readers and restricted database channels. Tests run the complete
fictional setup sequence against native PostgreSQL 17. No website route imports
the adapter, and no hosted connection, credential or provider operation is added.

## Activation boundary

The default mode is disabled. Every method rechecks explicit `isolated-fixture`
mode, `APP_ENV=test`, non-production `NODE_ENV` and a valid configured owner UUID
before calling a dependency. Development and production are rejected, including
when environment changes after construction. This is a fixture-only proposal,
not a new live feature flag or authorization to enable it through `.env.local`.

The module imports `server-only`; integration tests prove a browser/client import
is rejected. There is no connection factory, credential loader, browser SDK,
service-role key, operator invitation sender, reset flow or password setter.
The existing public setup previews, sign-in callback, owner/admin authorization,
cookies and private HQ remain unchanged.

## Methods and current authority

| Method                     | Request and effect                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readSelf`                 | Validated binding ID; verifies current identity then calls the self-reader channel. Returns only the strict private profile/membership projection and `workspaceAccess: false`.                                                      |
| `saveProfile`              | Validated operation/binding/revision and allowed profile fields; derives actor from fresh verified identity and passes a fixed, parameterized `profile` command. No subject, role, evidence or password can be supplied in the form. |
| `finalize`                 | Separate fixed command with operation/binding/revision; SQL rechecks setup completion/current status. A returned database revision is not a workspace permit.                                                                        |
| `recordVerifiedInvitation` | Reads trusted evidence of an already verified invitation for this exact subject/binding/operation/revision, re-verifies identity, then records acceptance through SQL.                                                               |
| `recordVerifiedPassword`   | Reads trusted evidence of an already successful password step, re-verifies identity, then records its SQL receipt. Does not accept, store or change a password.                                                                      |

The injected identity reader must be a fresh server `getUser()` verification,
never cookie/JWT decoding or form/profile metadata. The adapter requires a valid
non-anonymous UUID identity and a valid, non-future email-confirmation timestamp.
It refuses the configured owner and known owner/admin admission records from
streamer setup; their existing login path stays separate.

New pending streamers do not need an active version-1 `ggs_pilot` admission merely
to reach the adapter. The authoritative private SQL binding independently checks
approved application, configured owner, matching subject, accepted invitation,
membership and progress. This avoids granting early membership to make old
callback checks pass. That old callback has not been changed or bypassed here.

All SQL strings are fixed and parameterized. Read and mutation channels are
separate injected dependencies. Profile values are strictly validated and normalized;
actor is always derived from verified identity. No caller-provided SQL, email,
subject, role, completion flag or digest selects authority. SQL computes its own
internal request digest, preserving the reviewed migration's exact encoding.

## Evidence is a trusted dependency, not an HTTP input

The evidence reader receives only kind, verified subject, binding ID, operation ID
and expected revision. Its strict result must match every field, declare verified
success and contain an opaque evidence UUID. Extra fields and mismatches fail
closed. Identity is checked again after the potentially slow evidence lookup;
an account switch/revocation cannot reuse the earlier identity snapshot. SQL then
rechecks current binding/status and revisions at the mutation boundary.

Tests provide fictional durable evidence records. No concrete Supabase invitation
exchange or password-update gateway exists in this PR. An evidence UUID is not a
password, token, signed provider proof or authorization credential. A compromised
injected evidence/database dependency could attest false success; this prototype
does not eliminate that server trust boundary.

Before real Auth integration, implement and review the producer of those receipts,
including invitation/project/subject correlation, replay handling, authoritative
preflight before any password change, recent-session requirements and recovery.
Do not place an arbitrary client flag behind the evidence-reader interface.
Never infer password success from an account timestamp, profile metadata or hash.
Existing accounts, invitation mail and password recovery remain separate gates.

## Failures and retries

Provider exceptions, malformed/private query output and database errors become
controlled `invalid/denied/conflict/unavailable` classes, without raw error causes,
provider messages, request data or tokens. Unexpected result fields are rejected,
not forwarded. The adapter logs nothing and performs no automatic retry.

After verified evidence, an uncertain database result becomes
`reconciliation-required`: the provider step may already have completed. Preserve
the original operation/binding/revision/evidence in the trusted operation system;
do not perform another password update or email send to guess whether it worked.
Denied, invalid or conflicting results also authorize no provider retry.

Native tests deliberately lose acknowledgements **after real commits**. The first
profile call reports unavailable with no hidden retry; an explicit exact retry
returns the existing receipt without another profile event. For a password receipt,
the caller receives reconciliation-required; the fixture explicitly rereads the
same durable evidence and verifies one database event. That is not proof of real
provider idempotency, nor a user-facing automatic recovery flow.

Every method verifies identity anew, and revoked database membership is denied
even when the fixture Auth identity stays unchanged. Returned membership/profile
data is not a reusable authorization snapshot. All future workspace/data handlers
must repeat current server checks inside each operation.

## Verification and remaining gates

[Isolated adapter cases](../tests/storage/onboarding-adapter.test.ts) cover disabled
and forbidden runtimes, fresh/revoked/invalid identity, owner/admin separation,
injected authority fields, query mapping, proof mismatch/account switch, safe
exceptions, strict output and separate finalization. The
[native suite](../tests/postgres17/onboarding.test.ts) adds the fixture identity/
evidence-to-SQL round trip, foreign-subject denial and lost acknowledgements.
[Client-boundary tests](../tests/integration/boundaries.test.ts) enforce server-only
imports. All tests use fictional identities and send no provider requests.

Both migration files remain unchanged; this increment applies no hosted SQL.
No local website setting or secret store changes. Retention/linkage/backups and
verified-rights work still blocks real profile collection, as documented in the
migration review. The earlier real-owner email/callback verification is still pending.

Stop for this PR review. Next is the concrete fixture-backed invitation/evidence
gateway and HTTP setup orchestration, with bounded same-origin requests, cookie/
cache handling, replay/CSRF tests and recovery design, still disconnected by default.
Do not connect hosted resources, invite a person, set a real password, collect a
profile, enable a workspace or deploy without its separately reviewed stage.

Reference: [Supabase server session verification](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
