# Isolated storage transport prototype

The next step of the [testing connection plan](testing-connection-plan.md) is
implemented as a quarantined [server-only transport](../proposals/application-storage/transport.ts).
It uses the actual pinned node-postgres driver against a disposable local PG17
database. No application/startup module imports it. The driver remains a dev
dependency; there are no new dependencies, production environment variables,
credentials, routes or hosted changes. The SQL draft is unchanged.

## Explicit boundary

The factory accepts only `appEnv=test`, the disposable-local-postgres17
acknowledgement, host `127.0.0.1`, TLS port **55438**, a random fixture database
name, distinct fixture intake/review names/passwords, and an explicit CA. Unknown
fields, connection URLs, production mode, hosted targets, swapped roles and shared
secrets are rejected before connections. It does not read `.env` or configuration
from ambient PG variables. This local-only contract must not be loosened casually
to connect to Supabase; hosted configuration/provisioning needs a separate review.

Each role has a private one-connection pool. Explicit startup settings bound
connection acquisition to five seconds, statements to ten, locks to three and idle
transactions to fifteen seconds. TLS verifies chain and hostname with TLS1.2 or
newer. Pool idle sockets expire after thirty seconds. Queries are unnamed and
parameterized. The trusted adapter controls SQL; this is not a user-facing SQL API.
The interface supports individual statements only, not cross-call transactions.

Errors expose only a generic message and an allowlist of safe codes needed by
the adapter/tests. They contain no driver cause, SQL, parameters or connection
configuration. Failed query clients are destroyed. An idle pool error marks that
channel unhealthy; queries fail closed until transport recreation. The other
channel remains separate. Close refuses new work, drains running queries and is
idempotent. No transparent retries occur after uncertain outcomes; the adapter's
operation UUID/payload retry contract remains the caller's responsibility.

## Evidence and its limits

The opt-in `pnpm test:storage:pg17` runs both native files sequentially because
they create the same proposal group-role names. There are **24 native cases**:
the existing twelve migration/concurrency cases and twelve new transport cases.
An integration test also rejects transport imports in the client runtime.
Together with the existing ordinary/browser suites, the repository has 257 tests.

The [TLS fixture](../tests/postgres17/tls-bridge.ts) uses OpenSSL to create a
disposable CA and valid/wrong-host/expired leaf certificates. Private keys are
generated at runtime, held in a temporary directory owned by the fixture and
removed in a finally block; no keys or certificates are committed or installed in
the OS trust store. Windows uses Git for Windows' OpenSSL; Linux CI uses OpenSSL
on its runner. Missing tooling fails the tests rather than skipping encryption.

The bridge binds only loopback 55438, handles PostgreSQL SSLRequest, terminates
TLS and forwards to the isolated PostgreSQL server at loopback 55437. **That second
leg is plaintext inside the local fixture.** It is not Supavisor, native database
TLS, tenant authentication or proof of hosted upstream encryption. The test
controller remains the existing opt-in disposable-local admin, creates only random
fixture databases/logins and refuses pre-existing proposal roles. No real data is
used; fictional emails end in `.invalid`. The TLS suite applies the unchanged
migration using its fixture admin; the separate migration suite retains the
non-superuser setup regression. No managed-role claim comes from the TLS suite.

Tests verify actual driver TLS acceptance and rejection (including exact safe
certificate-error codes), refusal of plaintext, hostile ambient PG overrides,
current/session login identity, timeouts, separate routine/table permissions,
end-to-end adapter submission/retry/owner decision, fresh denied owner checks,
server cancellation with no continuing sleep, sanitized query errors and reuse,
idle backend termination, bounded queued acquisition and in-flight close/drain.
Existing native tests cover RLS/audit/decision races and acknowledgement loss.

## Next stage

This prototype does not complete the hosted connection gates. Before any hosted
use, review target-bound configuration, secret storage and rotation, provider CA
maintenance, actual custom-role authentication and platform restrictions. Follow
the ordered [hardening/schema/login/owner-seed reviews](testing-connection-plan.md#execution-sequence-and-exact-acceptance-evidence).
The current form remains fictional; privacy, retention/redaction, authorization,
rights handling and abuse controls still precede real collection. No setting,
role, schema application, owner seed, invitation or deployment is authorized here.
