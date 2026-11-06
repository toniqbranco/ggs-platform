# Local interactive streamer setup

This stage connects bilingual setup screens to the fictional SDK/HTTP flow. It
creates **no real account, invitation, password, profile or streamer access**.
The existing `/es/setup` and `/en/setup` disconnected previews and live magic-link
sign-in are unchanged. HQ stays private and has no public navigation link.

## Try it manually

From the checkout, run `pnpm dev:setup-fixture`, then open
[Spanish setup](http://localhost:3107/es/setup/local) or
[English setup](http://localhost:3107/en/setup/local). `/setup/local` defaults to
Spanish. Use **localhost**, rather than the numeric address printed by Next.js.
The dedicated server listens only on IPv4 loopback port 3107.

1. Choose **Empezar prueba / Begin test** to accept a fictional invitation.
2. Choose **Establecer contraseña de prueba / Set test password**. The displayed
   fixed sample value is read-only. Do not enter or use a real password.
3. Review **GG Demo Creator** and save the fixed sample profile. No personal-data
   fields can be edited or submitted.
4. Confirm the review step to finish. The completion screen explicitly grants no
   real access and opens no streamer workspace.
5. Refresh or switch ES/EN during the journey: the same browser session retains
   its current step. A different browser starts with no test identity.
6. After completion, restart the fictional journey if desired. Sessions expire
   after 30 minutes or disappear on server restart/hot reload. An expired session
   asks for a new fictional journey; it does not attempt real sign-in.

Failures show status/previous-result controls. The client never automatically
retries invitation or password mutations. Status checks read the current session;
command-only password receipts carry no password or token. Browser requests have
only `{}` bodies, and the server supplies all fixed fictional commands/values.

## Local-only boundary

The [page](../src/app/[locale]/setup/local/page.tsx) and
[request handler](../src/app/auth/setup-local/[action]/route.ts) are disabled by
default. [The gate](../src/lib/setup-local/gate.ts) requires **all** of:

- NODE_ENV=development and APP_ENV=test;
- `GGS_SETUP_LOCAL_FIXTURE=fictional-only`;
- exact app origin `http://localhost:3107`;
- real pilot sign-in, review storage and browser services explicitly disabled,
  with empty browser provider URL/key.

Page/handler Host and any forwarded Host must match `localhost:3107`. Requests
also require exact origin, same-origin fetch metadata, POST JSON, no query string
and a strict empty object body. Existing bounded JSON reading enforces 8192 bytes,
valid UTF-8 and a three-second deadline. Unknown actions, personal fields and
out-of-order/replayed completed steps are denied. Runtime production cannot enable
this flow even with the local flag. Production page and handler checks return404.

The launcher overrides isolation variables in its child process only. It does not
edit `.env.local`, load credentials into the fixture, change the existing server's
configuration or alter Supabase. Its distinct ignored `.next-setup-fixture` cache
keeps it separate from the usual app/cache. Type generation includes both cache
locations; production builds still use `.next`.

## Fixture data and sessions

[The wrapper](../proposals/streamer-onboarding/local-app-fixture.ts) uses the
[shared fictional wire model](../proposals/streamer-onboarding/wire-fixture.ts) and
[reviewed SDK/HTTP orchestrator](../proposals/streamer-onboarding/http-fixture.ts).
The same wire model now serves the existing unit/native integration suites through
a re-export; application source does not import test files. The actual pinned SSR
SDK still requires a fake fetch against `.invalid`. There is no global fetch
fallback, provider credential or real network call in the fixture.

Each random 256-bit opaque session has a separate fictional subject, operation
IDs and fake provider session. HttpOnly Strict session cookies are scoped to the
local handler; HttpOnly Lax SDK cookies retain their dedicated fixture namespace.
They cannot authorize current pilot/HQ/streamer routes. Copying only the local
session ID without its provider session fails verification. Responses are private,
no-store and no-referrer; the page is excluded from indexing.

This interactive demonstration stores **only fixed fictional data in memory**.
It is not the durable PostgreSQL store, an approval service, an account creation
flow, a recovery console or an activation mechanism. The earlier durable store and
owner recovery remain separately tested, unapplied/inactive components. No SQL,
credential or operator permission is added in this PR.

Memory has a 128-session admission limit; slots are reserved before asynchronous
work. Each session serializes mutations and enforces the next expected step.
Expired entries are pruned on the next request and all memory disappears on process
restart. There is no localStorage/sessionStorage use, file storage, telemetry or
collection of personal form fields. The fixed profile uses Spanish as its sample
locale; switching the UI changes copy and preserves the current test step.

## Evidence and next review

`pnpm test:e2e:setup` exercises Spanish and English on desktop/mobile, actual
browser cookies, step transitions, refresh/language preservation, error recovery,
no automatic password replay, no external browser requests, no workspace/HQ links,
accessibility and narrow layouts. CI starts a fresh dedicated server; local runs
may reuse the already-running repository fixture. A production-build browser check
proves the new pages/handler remain404. Server tests cover environment gates,
origin/Host denial, personal-input rejection, isolated sessions, ordered/replayed
requests, copied/forged cookies, expiry and a manual pause beyond one minute.

Stop at this PR review and allow manual feedback on the local experience. The next
stage is the concrete **testing-pilot activation review**: consolidate the exact
unapplied SQL hashes, restricted credentials/grants, invitation recipient and email
flow, hosted password/recovery policies and profile retention/privacy requirements.
Resolve those decisions before an approved real-streamer test. Existing approvals
for earlier testing objects do not authorize new onboarding schema, invitations,
credentials or collection. The earlier real-owner email/callback issue remains
unverified; this fictional flow does not fix or bypass it. No production deployment
or launch date is included.
