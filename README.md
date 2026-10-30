# GG's Platform

A modern digital-talent and livestream website foundation: Next.js App Router,
strict TypeScript, pnpm, Roboto, and Spanish-default/English preview shells.

**WP-01 is closed. Current increment: WP-02 / PR-01, closed-pilot access model and
disconnected entry UX.** The owner approved the recommended pilot-access package.
HQ and streamer routes provide public invitation-only entry information, not
authenticated workspaces. Sign-in is unavailable; no credentials are collected.
No live service, account, database table, or deployment has been added.

[Current pilot-access scope and matrix](docs/wp-02-pilot-access.md)

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

## Preview routes

| Space    | Spanish (default) | English        |
| -------- | ----------------- | -------------- |
| Public   | `/es`             | `/en`          |
| HQ       | `/es/hq`          | `/en/hq`       |
| Streamer | `/es/streamer`    | `/en/streamer` |

`/`, `/hq`, and `/streamer` temporarily redirect to their Spanish versions while
preserving query parameters. ES/EN selection retains the current shell. Unsupported
locales and unknown routes return 404.

Pilot information is at `/es/pilot` and `/en/pilot`; the generic restricted-access
message is at `/es/access-denied` and `/en/access-denied`. These are public preview
states, not a working sign-in flow or protected resource.

## Verify a change

```sh
pnpm check
pnpm test
pnpm security:audit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
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
- Keep services disconnected. Optional variables live in `.env.example`; the
  [environment guide](docs/environment.md) describes the disabled Supabase guard
  and browser/server boundaries. Credentials alone cannot enable connections.
- Review [security scope](SECURITY.md) before introducing data or integrations. The
  [staging plan](docs/staging-plan.md) is preparation only, not deployment authorization.

Some bundled ESLint plugins still declare older peer ranges. The pinned Next.js
configuration supports the installed ESLint version and checks pass; recheck this
compatibility when upgrading tooling.

## Review gates

WP-01 follows five separately reviewed PRs: bootstrap → design/localization →
disconnected boundaries → tests/CI/security/staging preparation → documentation/handoff.
WP-01 is closed following PR-05 merge/acceptance. The owner approved WP-02's
closed-pilot access package. Stop after its first access-model/UX PR for review;
confirm the live integration method, non-production target, and any schema before
the next increment. Review boundaries and service permissions remain explicit.
