# SDK invitation/password gateway and HTTP fixture

This increment exercises the pinned Supabase SSR SDK through a mandatory fake
fetch and the reviewed [onboarding adapter](onboarding-adapter.md). It adds
server-only proposal modules, not public application routes. The real website,
magic-link callback, owner/admin login, setup previews and hosted project remain
unchanged. No email, real invitation, password or account is created or updated.

## Hard isolation

Both gateway and request orchestrator default to disabled and require explicit
`isolated-fixture` mode, `APP_ENV=test` and non-production `NODE_ENV`. Owner UUID
configuration must be valid. There is no `.env.local` enable switch or live
connection factory. Client-import boundary tests enforce `server-only`.

The SDK URL is fixed to `https://onboarding.example.invalid`, with a clearly fake
publishable key and a required injected fetch. Only selected Auth verify/user/
refresh/local-logout paths and methods are permitted; redirects are rejected and
requests carry no-store, a deadline and no automatic endpoint fallback. No real
project URL/key is read. Tests use in-process fake provider responses, never DNS
or actual Supabase network calls.

The HTTP fixture's exact canonical origin is `http://localhost:3107`, matching
NextRequest's loopback normalization. It does not change the website's existing
`http://127.0.0.1:3103` origin. No server listens on 3107 under this increment;
tests invoke real NextRequest/NextResponse objects directly.

## Request protocol

| Prototype path           | Strict JSON body and behavior                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/setup/invitation` | Binding/operation/expected revision and a fictional token hash; verifies only Auth `invite` type, checks fresh identity against the trusted operation, records durable evidence, then records SQL acceptance.             |
| `/auth/setup/password`   | Binding/operation/expected revision, new password and exact confirmation; fresh identity and an authoritative pending-step claim precede SDK `updateUser`, followed by fresh identity/evidence recording and SQL receipt. |
| `/auth/setup/profile`    | Existing strict profile command; server-derived actor and SQL enforce the current own-binding state/revision. No identity, role, evidence or password field is accepted.                                                  |
| `/auth/setup/finalize`   | Separate fixed command; profile completion alone never grants membership. No workspace route or permission is opened.                                                                                                     |
| `/auth/setup/status`     | Binding ID only; current verified identity and SQL authorize the private projection, always with `workspaceAccess: false`.                                                                                                |

Two command-only reconciliation paths, `/auth/setup/invitation-receipt` and
`/auth/setup/password-receipt`, use already verified evidence and current identity.
They accept no token/password and perform no provider effect.

All are POST-only, exact same-origin with `Sec-Fetch-Site: same-origin`, JSON-only
and reject query strings. GET links cannot consume an invitation or reset/change a
password. Bodies are limited to 8192 bytes including streaming input and have a
three-second read deadline/cancellation. Unknown fields, malformed JSON/UTF-8,
cross-site requests and return URLs are rejected before SDK/ledger/SQL work.

These paths are **not mounted in `src/app`** and are not a manual/live API. The
request handler is called only by fixtures; publishing or enabling it is not
authorized by this code or a PR merge. Public pages do not gain a working password
form. Marketing signup and public HQ remain closed.

## Trusted operation store and evidence

Before an SDK effect, a trusted injected operation store atomically checks the
current binding, approval, explicit streamer role, pending membership and correct
step, then claims the exact kind/binding/operation/revision once. A password claim
must also match the freshly verified subject. An expired, in-flight, reconcile or
ineligible claim cannot issue another provider call. The configured owner and
known owner/admin identities cannot enter first-streamer setup.

The store's returned subject/role/eligibility are server assertions, never form
fields. The gateway schema validates their shape, binding and expiry; it cannot
make a malicious store trustworthy. Tests supply an in-memory fixture store with
atomic single-process claims. **No durable production implementation or current
PostgreSQL preflight/lease bridge for this store is included.** That bridge is a
required later gate, including real races and crash recovery, before hosted use.

After the SDK effect, `getUser()` verifies the current account again. A mismatched
account is not accepted, newly issued fixture cookies are cleared and no SQL setup
receipt is written. Successful provider evidence receives an opaque UUID in the
trusted store. The adapter then independently rechecks identity and binds that
evidence to its exact command before SQL. Raw token hashes and passwords are not
passed to the store, SQL, audit, response JSON, URLs or application logs.

Completed secret-bearing requests return reconciliation-required rather than
acknowledging a resubmitted or changed password/token as applied. Dedicated
command-only receipt requests with the correct current session reuse the same
evidence and explicitly label the response `receipt: true`; they accept no secret
and perform no SDK verify/password update. This avoids storing a password-derived
fingerprint just to compare secret retries. A missing browser
session is not repaired by replaying a consumed token. Unknown provider outcomes,
store failures after an SDK effect and revocation during a password update require
reconciliation and do not cause automatic repeat/update/resend or activation.
No cross-service atomicity is claimed.

## Cookies and private responses

The actual SSR SDK reads/writes only the isolated fixture cookie namespace,
including chunks. Cookies are HttpOnly, SameSite=Lax, path `/`, without a Domain;
Secure is false only because this hard-gated fixture uses loopback HTTP. No actual
pilot cookie is read, overwritten or cleared. SDK refresh writes are copied to
the returned response, including failure responses; newly issued wrong-identity
fixture sessions are signed out locally and expired regardless of provider errors.
This does not claim global revocation of already-issued tokens on other devices.

Every response, including rejected requests, is private/no-store with Vary: Cookie
and no-referrer. Response bodies contain only validated setup state/revisions or
controlled error classes, not SDK exceptions, tokens or password values. The
gateway never trusts the cookie's embedded user/role object instead of `getUser()`.

## Password and recovery limits

The fixture contract requires at least 12 code points, at most 72 UTF-8 bytes,
no NUL and exact confirmation, with no trimming or normalization of the secret.
The upper bound is a conservative **fixture choice**, not a claim that the hosted
provider's complete policy is configured or verified. Confirm provider length/
Unicode behavior, strength/leaked-password settings, recent-session/nonce rules
and security notifications before any real password step. No settings change or
paid-plan selection is included.

Returning email/password login and password recovery are not implemented. Before
activation, review a generic existing-account-only reset request, exact configured
return origin, distinct recovery-token handling, a restricted password-only
session, reauthentication, attempt limits and subsequent session revocation.
Recovery must never approve an application, accept an invitation, assign a role,
reactivate membership or complete a profile. Email/contact changes need their own
verified process. Do not reset the owner/admin's login as a side effect of this
streamer work.

The fixture's body-only invitation redemption is not authorization to change the
hosted invite template or bypass existing PKCE. Before real email, review a safe
landing/confirmation flow, link scanners, browser handoff, access-log redaction,
expiry/replay, SMTP reliability and recovery separately. The earlier real-owner
callback/email issue remains unverified and is not fixed by this fixture.

## Evidence and next review

The [HTTP suite](../tests/storage/onboarding-http.test.ts) covers actual SDK wire
calls, private cookie flags/refresh, disabled runtimes, same-origin enforcement,
bounded/stalled/malformed bodies, forged cookies, account mismatch, expiry,
competing/replayed requests, provider redirects, preflight denial, password bounds
and uncertain outcomes without automatic repeats. The
[native suite](../tests/postgres17/onboarding.test.ts) additionally runs the SDK/
HTTP sequence through restricted real PostgreSQL channels, verifies one password
effect on exact retry, saves/finalizes fictional data and denies access after
revocation while the SDK identity remains valid.

Both reviewed migrations remain unchanged and are applied only to temporary local
fixture databases for these tests. No hosted schema, credentials, records or
deployment changes. The existing suites and CI remain required.

Stop for this PR review. Next is the durable operation-store/preflight bridge and
its recovery/failure handling, followed by reviewed page/request integration.
Retention/linkage/backup work still blocks real profile collection. No generic
"proceed" enables hosted Auth effects, SQL application, invitations or deployment.

References checked: [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
[OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp),
[password security](https://supabase.com/docs/guides/auth/password-security),
and [current changelog](https://supabase.com/changelog). Installed Next.js route/
cookie documentation and pinned SDK cookie helpers were also inspected.

The next isolated increment is now documented in the
[durable operation-store review](onboarding-operation-store.md). It replaces the
in-memory store in native tests only; the real website remains disconnected from
this setup flow. Its owner recovery primitive is SQL-only and requires a later
fresh-owner adapter and verified provider-state/quiescence contract.

The [local interactive setup stage](local-setup-app.md) adds a gated wrapper around
this orchestrator on a dedicated localhost development server. It supplies only
fixed fictional inputs and uses ephemeral memory, with no hosted or durable-store
connection. The main setup previews and current pilot Auth routes are unchanged.
