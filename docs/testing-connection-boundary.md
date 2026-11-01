# Testing connection boundary — disconnected preparation

The [applied testing schema](testing-storage-status.md) is empty. This increment
prepares `createTestingStorageTransport` beside the existing isolated factory in
the [quarantined transport module](../proposals/application-storage/transport.ts).
It creates no hosted login, credential file, connection, owner seed or route.
The driver remains a development dependency. No app/startup module imports it.

## Exact configuration contract

All connection input is supplied explicitly; no `.env`, connection URL or PG
variable is loaded. Actual APP_ENV/NODE_ENV production is refused even if supplied
input says development. Unknown fields are rejected. The testing factory accepts only:

| Field           | Accepted value                                                        |
| --------------- | --------------------------------------------------------------------- |
| appEnv          | development; production/test mode refused by this factory             |
| acknowledgement | reviewed-gg-livestream-testing                                        |
| projectId       | rchxnmpsxfbsicthasxn                                                  |
| host            | aws-1-us-west-2.pooler.supabase.com, observed from Connect            |
| port / database | 5432 / postgres; shared session pooler                                |
| intake user     | ggs_pilot_intake_login.rchxnmpsxfbsicthasxn                           |
| review user     | ggs_pilot_review_login.rchxnmpsxfbsicthasxn                           |
| passwords       | distinct 64-character lowercase hex strings, to be securely generated |
| ca              | exactly the reviewed public CA PEM, currently valid and CA=true       |

The factory lazily creates two private pools without opening sockets. Querying
one would authenticate through the selected pooler, so that operation remains
behind the separate credential/smoke-test approval. Exact project strings are
configuration safeguards, not authorization to connect or proof of tenant identity.
The later authenticated check must verify current/session role and database.

The certificate pin is SHA-256 fingerprint
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
It came from the dashboard-linked [provider CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).
The same public certificate is a [test fixture](../tests/fixtures/supabase-public-ca-2021.crt),
not a secret or OS trust-store installation. It expires on 2031-04-26. Different,
expired, malformed or appended trust fails closed. Provider CA/endpoint changes
require review, updated evidence and tests; do not disable validation to recover.
Each TLS connection still validates its peer certificate chain and hostname.

Both factories share the already tested query/pool implementation: per-role max=1,
five-second acquisition, ten-second statement, three-second lock and fifteen-second
idle-transaction timeouts; TLS1.2+, safe errors, idle-error denial, idempotent close
and draining. Application names distinguish testing from isolated fixtures. The
isolated factory's loopback-only target checks remain intact. No automatic retry,
session SET ROLE or pooled identity state is introduced.

## Dedicated credential proposal — not executed

Recommend two database service identities, **ggs_pilot_intake_login** and
**ggs_pilot_review_login**, each bound only to its corresponding existing NOLOGIN
group. They are not Auth accounts or owner/streamer admissions. Both must be
NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOREPLICATION and NOBYPASSRLS, with distinct
cryptographically generated 32-byte passwords encoded as hex. Grant inherited
entry privileges without ADMIN or SET membership options. No ownership/executor
membership, schema CREATE, direct table grant or cross-role grant is proposed.

Before exact execution approval, prepare and verify the provisioning/secure-handoff
operation, the current PUBLIC/default database/schema grants and the authenticated
read-only smoke checks. PUBLIC CONNECT/TEMP or other inherited defaults cannot be
removed merely by revoking a grant from one login; report effective privileges
and stop on unexpected access. Do not change global PUBLIC rights or another
consumer's settings without a separate review.

For this Windows local-testing stage, propose an encrypted **CurrentUser DPAPI**
credential bundle at `<checkout>/.local-secrets/ggs-testing-storage.dpapi`, with
directory/file ACLs limited to the owner Windows user and SYSTEM. It is not created
or loaded by this increment. Protect/verify the bundle and ACLs before enabling
new logins; do not put database passwords in `.env.local`, command arguments,
source, PR text, screenshots or diagnostics. DPAPI binds the bundle to this Windows
identity; it is not a portable deployment secret manager or protection against a
compromised same-user process. Deployment secret storage needs a later decision.

The future handoff implementation must avoid exposing generated passwords in
agent output or logs, verify encrypted persistence/decryption and define recovery
if persistence or authentication fails. Begin with new roles unable to log in;
leave them disabled on any failed handoff, with no invitation or intake fallback.
Do not overwrite existing same-named roles or rotate credentials as an incidental
retry. Rotation/revocation must account for established database/pooler sessions.
This proposal and a code merge do not approve any of those operations.

## Verification and next review

Six ordinary tests intercept Pool.connect before any socket/authentication to
verify target/admin/configuration denial, exact role/pool/TLS options, CA rejection,
opaque lazy construction/close and sanitized diagnostics. They use clearly
fictional repeated-character passwords; they are not hosted authentication tests.
The native suite rechecks the shared real driver against its disposable TLS bridge.
Its plaintext loopback upstream is not evidence of provider upstream encryption.

The repository now has 263 tests: 122 unit, 12 integration, 21 ordinary storage/
configuration, 24 native PostgreSQL and 84 browser cases. No hosted authentication
has occurred through this factory. Dedicated login creation, encrypted credential
storage and read-only hosted smoke checks require exact review after implementation;
owner seeding, synthetic writes and real intake remain separate later gates.

Sources: [Supabase connection modes and custom role usernames](https://supabase.com/docs/guides/database/connecting-to-postgres),
[PostgreSQL role membership options](https://www.postgresql.org/docs/17/role-membership.html).
