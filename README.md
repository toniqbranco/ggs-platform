# GG's Platform

A modern digital-talent and livestream website foundation: Next.js App Router,
strict TypeScript, pnpm, Roboto, and Spanish-default/English preview shells.

**WP-01 is closed. Current increment: WP-02 isolated storage transport.**
Streamer routes provide public invitation-only entry information and a fictional
application form. A private owner-only review preview uses synthetic records;
no live submissions, decisions, or invitation sending are implemented. Optional
server-only email-link sign-in targets the approved GG-livestream testing project.
The owner separately approved initial owner bootstrap and local Auth settings.
No live application tables, production service, or deployment have been added.

The [storage/transaction proposal](proposals/application-storage/README.md) adds a
quarantined SQL draft and server-only adapter prototype, tested only in ephemeral
embedded PostgreSQL. It is not connected to the website or the testing project.
`PILOT_APPLICATIONS_ENABLED=true` is rejected; real intake remains unavailable.

The [native PostgreSQL 17 suite](docs/postgres17-verification.md) adds isolated
multi-connection and restricted-login checks. It uses a disposable local/CI server,
never the Supabase project. The original verification left the proposal unchanged.
The subsequent [managed-role correction](docs/managed-migration-compatibility.md)
updates only the unapplied bootstrap and adds a non-superuser regression case.

The [testing connection plan](docs/testing-connection-plan.md) proposes transport,
dedicated login boundaries, TLS checks and a separately authorized hosted setup
sequence. It adds no driver wiring, credentials, hosted changes or live intake.

The [isolated transport prototype](docs/isolated-storage-transport.md) tests the
real driver through a loopback TLS fixture, with separate restricted pools. It
accepts only disposable local targets and remains outside application imports.

[Current application/review preview](docs/wp-02-application-preview.md) ·
[Approval-only access contract](docs/wp-02-approved-access.md) ·
[Sign-in scope and verification limits](docs/wp-02-sign-in.md) ·
[Pilot-access model and matrix](docs/wp-02-pilot-access.md)

[Documentation index](docs/README.md) · [Delivery and acceptance](docs/wp-01-status.md) ·
[WP-02 handoff](docs/wp-02-handoff.md)

## Run locally

Use Node.js 24 (`.node-version` records the validated local patch) and pnpm 11.25.0,
as specified in `package.json`. No environment file or credentials are required.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`; the root redirects to Spanish. For a production-mode
local preview, run `pnpm build`, then `pnpm start` (port 3000 by default).
The [runbook](docs/runbook.md) covers a fresh checkout, alternative ports, restarts,
and common issues.

## Public website map

| Space    | Spanish (default) | English        |
| -------- | ----------------- | -------------- |
| Public   | `/es`             | `/en`          |
| Streamer | `/es/streamer`    | `/en/streamer` |

`/` and `/streamer` temporarily redirect to their Spanish versions while
preserving query parameters. ES/EN selection retains the current shell. Unsupported
locales and unknown routes return 404.

Pilot information is at `/es/pilot` and `/en/pilot`; the generic restricted-access
message is at `/es/access-denied` and `/en/access-denied`. These are public preview
states. Optional sign-in is at `/es/sign-in` or `/en/sign-in`; `/es/session` and
`/en/session` show session status only. Workspace access remains closed.

HQ is excluded from the public map, navigation, calls to action, and pilot audience
information. `/hq`, `/es/hq`, and `/en/hq` return 404. Hiding links alone would not
protect an admin workspace. The separate `/es/hq/applications` and
`/en/hq/applications` rehearsal routes require fresh owner-only verification before
HTML/RSC and independently before fixture data. General HQ and operational tools
remain unavailable. The public `/es/apply` and `/en/apply` form sends/saves nothing.

## Verify a change

```sh
pnpm check
pnpm test
pnpm security:audit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:auth
```

`check` validates environment, lint, strict types, and formatting. `test` runs unit
and integration tests. Browser tests use a separate local production server on port 3104. The [testing guide](docs/testing.md) explains installation, coverage, diagnostics,
and GitHub CI. The audit needs registry access. CI must pass on the review revision.

## Work within the foundation

- Follow the [architecture map](docs/architecture.md) and existing source conventions.
  `@/*` resolves to `src/*`; Server Components are the default. Use `pnpm format`
  before committing and keep the pnpm manifest/lockfile together.
- Extend the approved [design direction](docs/design-direction.md), shared CSS tokens,
  and both dictionaries together. Roboto and original artwork are self-hosted.
- Keep browser services disconnected. Optional variables live in `.env.example`;
  the [environment guide](docs/environment.md) and [pilot sign-in guide](docs/wp-02-sign-in.md)
  describe browser/server boundaries and the optional testing-project Auth adapter.
  Production integration requires a separate review.
- Review [security scope](SECURITY.md) before introducing data or integrations. The
  [staging plan](docs/staging-plan.md) is preparation only, not deployment authorization.

Some bundled ESLint plugins still declare older peer ranges. The pinned Next.js
configuration supports the installed ESLint version and checks pass; recheck this
compatibility when upgrading tooling.

## Review gates

WP-01 follows five separately reviewed PRs: bootstrap → design/localization →
disconnected boundaries → tests/CI/security/staging preparation → documentation/handoff.
WP-01 is closed following PR-05 merge/acceptance. WP-02's access-model and
sign-in, admission enforcement, and browser-recovery PRs are merged. Owner bootstrap
and local testing Auth settings were separately approved. The application/review
rehearsal, storage proposal and native-PG17 verification are merged. The managed
migration compatibility correction stops for review before hosted credentials or live schema,
intake, operational decisions, or invitations. Merging a proposal does not
authorize applying its SQL. Each later increment
retains its own review boundary.
