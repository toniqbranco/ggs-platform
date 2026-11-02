# Local owner review — read-only integration

This stage adds a separately enabled saved-application queue and history to the
existing private `/{locale}/hq/applications` page. Spanish is the default; English
is supported. There is no public HQ link or generic HQ page.

`PILOT_REVIEW_STORAGE_ENABLED=false` is the default. The original fictional
rehearsal remains available when it is off. When enabled, the page uses
`GET /auth/application-review?operation=list` or `operation=history&applicationId=…`.
No submission, decision, invitation, account or permission mutation is exposed.
Public intake remains disabled and enabling `PILOT_APPLICATIONS_ENABLED` is rejected.

## Access and response boundary

Every read freshly verifies Supabase `getUser()` and the current trusted admission
against the exact configured owner and fixed `pilot-management` target, before any
credential or database work. Admins, streamers and anonymous/revoked users cannot
read storage. Actor identity is never accepted from a browser. Cross-site browser
requests, unexpected parameters, duplicate keys and mutation operations fail closed.

Responses are private/no-store, vary by Cookie, preserve Auth refresh/clear cookies
and contain only validated display fields. Contact keys, fingerprints, decision
actor IDs and credentials are stripped. Request and database diagnostics are not
logged or returned. The UI clears its queue/profile after any failed history or
refresh request, and makes no local/session-storage copies. Previously viewed
information cannot be recalled from a browser/user that already received it.

## Credential and connection boundary

Live reads in this increment require Windows, PowerShell 7.4+, `APP_ENV=development`,
the owner's existing CurrentUser DPAPI bundle and a local development server.
The loopback application origin is required for enabling the flag. Test-mode UI
fixtures may render the component, but APP_ENV=test cannot decrypt credentials.
Production/staging application environments cannot enable the integration.
`next start` sets NODE_ENV=production, which the existing credential store rejects;
use `pnpm dev` for this local testing connection. This is not a hosting solution.

The application starts a fixed PowerShell script without a shell, profiles or
interactive windows. That script checks redirected pipes, a fixed purpose and the
development runtime, then reuses the reviewed DPAPI/ACL validation. Only the review
credential crosses the private stdout pipe into the Node server; the intake
credential is never exported. The parent bounds output and time, discards raw
diagnostics, kills on abort and never writes plaintext credentials to disk, env,
arguments or application responses. Imports/startup/build do not decrypt anything.
The existing proposal store API is reused without weakening its safeguards; its
other provisioning/operator files remain disconnected from application code.

The server owns one connection per read and closes it afterward. The target is
fixed to GG-livestream testing, session pooler
`aws-1-us-west-2.pooler.supabase.com:5432`, database postgres and the exact review
login. The driver verifies the pinned public CA/hostname and independently checks
database identity, session identity and upstream TLS. Each data operation runs in
an explicit READ ONLY transaction and is rolled back before disconnecting. No
arbitrary SQL or alternate endpoint is accepted. There are no automatic retries.

Database review credentials still have their previously approved function grants;
this PR does not revoke or expand them. The read-only transaction and operation
allowlist restrict this application's path. A compromised review credential could
attest the configured owner, as documented in the original storage design.
Same-user/admin compromise and guaranteed erasure of managed strings are not
solved by DPAPI. Run only in the dedicated local environment without transcription.

## Testing baseline and activation

The [sign-in continuation](sign-in-recovery.md) shows the review link only after
fresh session and owner-access checks. The public navigation still excludes HQ.

Approved operations on 2026-11-01 provisioned the two restricted service logins,
configured the existing sole owner and completed the fictional workflow test.
The Management token was deleted by the user. Exactly one fictional application
(`GG Test Creator - DO NOT CONTACT`) and its two receipts/two history events are
preserved. No Auth account, invitation or workspace access followed that decision.

This PR does not change the local feature flag or connect the running website.
After review/merge, enabling the local flag and restarting the dev server is a
separate operational step. Do not put passwords or Management tokens in `.env.local`.
Do not rerun provisioning, owner seeding or the fictional mutation runner.
Disabling the flag restores the preview and stops new storage reads; it does not
delete records or revoke database sessions/credentials.

The pilot screen deliberately shows only the first 50 applications in chronological
order and labels that bound. It is sufficient for the sole approved test fixture;
pagination/filtering and saved decisions are later reviewed changes. No claim is
made that this is ready for real intake. Privacy/retention/redaction/backups,
verified rights, minors, abuse controls, testing-fixture separation and launch
approval remain required. No deployment is included.

## Verification

Unit tests exercise fresh owner/revocation, denied roles, input/origin rejection,
cookie propagation and sanitized failures. Database tests intercept pg and verify
read-only transactions, bound arguments, identity checks, display-field redaction
and CA rejection, without hosted connections. Windows CI uses an encrypted
temporary fixture to verify the private credential pipe exports only the review
credential and rejects wrong runtimes/purpose/missing files. Browser tests use
mocked storage responses and fixture Auth, exercise both languages and viewport
sizes, and check accessible history, repeat selection, privacy clearing and no
mutation controls. They send no real Auth email or hosted database request.
