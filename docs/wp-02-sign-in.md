# WP-02 / PR-02: testing-project sign-in and sessions

## Approval and boundary

On 2026-10-30 the owner approved merging PR #6 and explicitly selected
`GG-livestream` (`rchxnmpsxfbsicthasxn`) as the development/testing Supabase project
for sign-in integration. Email magic links preserve the original planning choice.
This approval does not include account creation, invitations sent to people,
database/schema changes, project-wide setting changes, production, or deployment.

PR #6 is merged at `19098b1092da6207d0927a92d91d1edc21b0e33f`.
This increment stops for review before the next authorization increment.

## What is implemented

| Entry point                  | Behavior                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/es/sign-in`, `/en/sign-in` | Localized email-link request form when pilot auth is enabled; otherwise an unavailable message.                                          |
| `POST /auth/sign-in`         | Same-origin, bounded form body, validated email, `shouldCreateUser: false`, fixed callback origin, generic response.                     |
| `GET /auth/callback`         | Exchanges PKCE code using this browser's verifier cookie, verifies identity with `getUser()`, then redirects to a session-status screen. |
| `/es/session`, `/en/session` | Checks the session through a same-origin server endpoint; does not render private data or grant workspace access.                        |
| `GET /auth/session`          | Calls `getUser()` on the server, refreshes session cookies when needed, returns only authenticated/workspace-access booleans.            |
| `POST /auth/sign-out`        | Same-origin sign-out for the current browser session, with cookie propagation; does not claim to sign out every device.                  |
| `/hq`, `/es/hq`, `/en/hq`    | Still return 404. No public HQ links or admin UI.                                                                                        |

The streamer landing links to sign-in only in an explicitly enabled environment.
Language selection preserves sign-in/session pages. Missing, expired, used,
wrong-browser, and failed links lead to localized retry instructions. Password
reset is not introduced: request a fresh magic link; changing/recovering an email
address remains an owner-assisted process outside this increment.

## Server configuration

The existing `NEXT_PUBLIC_SUPABASE_ENABLED=false` browser-service guard remains.
The new Auth adapter is separate and marked `server-only`. No browser SDK or
external browser origin is needed, so CSP stays unchanged.

| Variable                         | Contract                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PILOT_AUTH_ENABLED`             | `false` by default; explicit string `true` enables the reviewed server adapter.                                          |
| `PILOT_SUPABASE_URL`             | When enabled, must equal `https://rchxnmpsxfbsicthasxn.supabase.co`.                                                     |
| `PILOT_SUPABASE_PUBLISHABLE_KEY` | Enabled adapter requires a modern publishable key; no secret/service-role/legacy keys.                                   |
| `APP_ENV`                        | Enabled Auth rejects `production`.                                                                                       |
| `NEXT_PUBLIC_APP_URL`            | Exact application origin; HTTPS, or HTTP on loopback for local development. No embedded credentials/path/query/fragment. |

Use `.env.local`, which Git ignores. Never paste keys into docs or commits. No
environment file is needed for a disconnected build. Production builds are also
used for local tests; `NODE_ENV=production` does not authorize a production service.
The separate `APP_ENV` label and pinned project enforce the approved target.

The local preview uses `http://127.0.0.1:3103`. Before actual email delivery is
tested, the project's Auth redirect allowlist must include the exact callback URLs
for the selected local origin and both supported locales, for example:

- `http://127.0.0.1:3103/auth/callback?locale=es`
- `http://127.0.0.1:3103/auth/callback?locale=en`

Do not use wildcard production redirects or trust forwarded hosts/`next` query
parameters. Keep the default PKCE-compatible email confirmation flow; this stage
does not modify email templates, SMTP, Site URL, or redirect settings.

## Trust and session behavior

Each request creates its own SSR client. Cookies are HttpOnly, SameSite=Lax,
path `/`, and Secure on HTTPS. Only server handlers use tokens; the client never
reads them. Cookies and the SDK's cache headers are written to the returned response.
Auth handlers use private/no-store responses and no-referrer. Auth pages are dynamic;
there is no shared session cache or ISR. SDK calls use no-store and a ten-second
network timeout. No tokens, emails, provider exceptions, or user records are logged
by application code.

`getUser()` verifies against Auth rather than treating an unverified cookie or local
JWT claims as current session authority. The session endpoint handles refresh and
returns no user ID/email/role. Provider errors fail closed. A fresh authenticated
session still has `workspaceAccess: false`: the policy evaluator remains a contract,
not deployed admission/role enforcement. No editable metadata, browser flags, or
query parameters grant authority. The next PR must bind verified identity to
authoritative admission and roles before any workspace or private data is opened.

POST operations check Origin before reading bounded URL-encoded form data. Callback
uses PKCE and this browser's verifier, and ignores external return URLs. Link-request
results do not distinguish existing accounts from unknown accounts or provider
errors. Supabase's provider limits remain in force; application-level distributed
abuse controls are a prelaunch requirement, not an implemented feature here.

## Verification and remaining integration checks

Read-only checks confirmed the selected project is healthy and its Auth endpoint
is reachable with email enabled. Project-wide `disable_signup` was **false**. The
application never creates an account through the sign-in form, but this does not
disable direct signup at the provider. Review project signup settings before a
closed pilot opens; no project setting was changed in this increment.

Unit tests cover project/origin restrictions, disabled mode, CSRF, validation/body
limits, enumeration-safe responses, fixed redirects, expired/invalid callbacks,
session errors, and no workspace authority. Integration tests use synthetic SDK
responses to verify PKCE, no automatic account creation, cookie/cache propagation,
refresh, revoked sessions, and local sign-out. Two browser suites cover the original
disconnected foundation and enabled sign-in screens with fixture configuration.
They send no real emails and create no accounts.

Email delivery and a real user's full sign-in/refresh/sign-out cycle have **not**
been verified. They need an explicitly approved existing test account and confirmed
callback/provider configuration. Do not treat a health check or synthetic session
test as proof of email delivery or complete production readiness.

## Next review gate

Review this PR before workspace authorization. Separately agree on owner bootstrap,
pilot admission and role storage, revocation/suspension guarantees, minimal schema
and RLS if needed, and any project-setting/account changes. Public page expansion,
marketing copy, Academy, commerce, attendance, live-platform integrations, production,
and deployment are outside this increment and remain later roadmap work.

## References checked

- [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase changelog](https://supabase.com/changelog): relevant TLS cipher retirement checked; no TLS weakening or project changes.
- Installed Next.js route-handler and cookie guides; installed `@supabase/ssr` 0.12.7 cookie/cache-header contract.
