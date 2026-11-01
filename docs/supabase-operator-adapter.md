# Supabase operator adapter — implemented, not authorized or run live

The [handoff coordinator](credential-handoff.md) now has a concrete operator
adapter: [PowerShell gateway](../proposals/application-storage/supabase-operator.psm1),
[private child](../proposals/application-storage/operator-main.ts), and
[Management API/SQL implementation](../proposals/application-storage/operator-adapter.ts).
No app, startup or deployment imports it. Construction is lazy and creates no
credentials or connection. The driver remains a development dependency.

## Exact access gap

The Supabase plugin remains connected. The installed CLI's read-only query for
the exact testing reference returned **Access token not provided**. Plugin tools
do not expose their OAuth token to this local adapter. No token was searched for
in unrelated stores, extracted from the plugin or substituted with an app API key.

This implementation requires a separately approved, short-lived **project-scoped
Management API token**, supplied locally as SecureString. It is not the website's
publishable key, a service-role key or the owner's sign-in password. Prefer scoped
permissions only for this testing project and the documented project-read/database
read/write operations; verify current endpoint permissions when issuing the token.
Do not create a broad legacy token to bypass a denied scoped request. No operator
authorization, token creation/login or real provisioning is performed in this PR.

The [manual entry point](../proposals/application-storage/run-operator.ps1) requires
the explicit provisioning acknowledgement and reads a token through a hidden
local prompt. It has **not been run**. Use it only after the exact role/grant/secret
storage/recovery operation is approved, in a dedicated non-transcribed process.
Do not paste tokens into chat, arguments, environment files or Git. The token is
not persisted by this code. If system logging policies would capture secret
parameters, resolve that operator-environment requirement without disabling
security logging as an incidental setup action.

## Secret and target boundary

The gateway starts the resolved Node executable without a shell or visible window.
Token/bundle data cross only the private child's stdin. Arguments contain only
fixed runtime flags and the script path; no secret is put in an environment
variable or plaintext file. The child receives bounded JSON and emits only typed
safe receipts. Raw stderr/causes are not forwarded. Startup/rejection/protocol
errors carry a safe stage marker; cleanup does not mask the original failure.
Child preload/TLS override environment settings are removed; production and
explicitly disabled TLS validation are refused.

Management requests use only HTTPS `api.supabase.com/v1/projects/rchxnmpsxfbsicthasxn`
and its database/query endpoint, with redirects refused and a fifteen-second
request deadline. Before each phase, verify the exact project ID/name, healthy
state, region and tested PostgreSQL build family. Endpoint/schema changes fail
closed. Error/429 responses are not retried. The query endpoint is documented as
experimental; no unauthenticated local test is evidence of hosted compatibility.

## Concrete role operations

Preflight verifies both names absent, owner configuration empty and four forced-RLS
tables. Recheck the existing SSL enforcement/API-exclusion/default-grant baseline
immediately before a real authorized operation; the factory is not permission
to skip that review. Existing CONNECT/TEMP defaults remain disclosed and unchanged.

Prepare creates only **ggs_pilot_intake_login** and **ggs_pilot_review_login**,
initially NOLOGIN/NOSUPERUSER/NOCREATEROLE/NOCREATEDB/NOREPLICATION/NOBYPASSRLS.
Each inherits only its corresponding entry group, with SET/ADMIN false. Conflicts
abort the whole DO block. No other role is adopted or overwritten.

Plain passwords stay in the DPAPI bundle/private process memory. The adapter
derives salted PostgreSQL SCRAM-SHA-256 verifiers for the administrative SQL, so
raw passwords are not interpolated into SQL or sent to the Management API.
**Verifiers are sensitive credential material**, not anonymous data. The trusted
provider necessarily receives them; this code does not claim to control provider
retention/logging. No local request/SQL/verifier diagnostics are emitted.

All role mutations are bounded transactions (ten-second statement/three-second
lock timeout). Per-operation transaction advisory locks serialize prepare/enable/
revoke. Role comments bind each new identity to its UUID and state: prepared,
enabled or revoked. Enable is allowed only from prepared and rechecks profiles,
membership, schema/table and exact routine privileges inside the atomic operation.
Revocation is a terminal marker: a delayed enable cannot revive the identities.
No DROP, automatic reset, overwrite or mutation retry is implemented.

The verified step checks actual current/session users and database through both
restricted pooled logins, strict client TLS/CA/hostname verification, upstream
session SSL, and direct private-table denial. Administrative catalog checks verify
all role flags, exactly one intended membership, exact function grants and no
schema/table authority. Owner configuration must still be empty; no application
rows, owner seed, Auth operations or invitations are needed for these checks.

Recovery accepts only matching operation markers, sets NOLOGIN and revoked state,
terminates sessions for those exact new identities, waits for zero sessions and
checks disabled profiles before returning confirmation. Missing permissions,
timeouts or continued sessions remain unconfirmed in the coordinator. The existing
hosted postgres role's pg_signal_backend capability was checked read-only; no
signal privilege is granted to application identities. Actual managed-pooler
recovery still needs its separately approved authenticated test.

## Verification and limits

- Ten no-network HTTP/contract tests cover target binding, redirects, token/input
  denial, 401/403/429/errors, secret-free SQL/receipts, privilege drift, uncertain
  enables, failed probes and recovery evidence. Requests are intercepted fixtures.
- Six native PostgreSQL cases apply the real generated role SQL, authenticate
  using the generated SCRAM verifier, deny table access, reject marker/membership
  conflicts, verify session termination and exercise a real overlapping
  revoke/late-enable lock barrier. The local operator is a non-superuser with
  role-creation and signal capabilities matching observed administrator attributes.
  These are disposable loopback roles, not hosted accounts.
- Four new Windows cases check lazy gateway/context/target guards and the real
  private child process with an invalid fixture token, rejected before HTTP.
  Together with the prior Windows suites there are 28 Windows cases. A new
  integration case rejects importing the operator in the client runtime.

The repository has **308 tests** across four jobs. Windows CI now installs the
same pinned Node/pnpm dependencies for the private child test; no new dependency
or CI secret was added. Local fixtures are cleaned and the database stopped.
Applied migration bytes remain frozen. Real API authentication, hosted role
creation, secret persistence in the real checkout and actual pooler compatibility
are **not verified** and remain behind authorization/exact operation approval.

Sources: [Management authentication and scoped tokens](https://supabase.com/docs/reference/api/introduction),
[query endpoint/permissions](https://supabase.com/docs/reference/api/v1-run-a-query),
[PostgreSQL SCRAM](https://www.postgresql.org/docs/17/sasl-authentication.html).
