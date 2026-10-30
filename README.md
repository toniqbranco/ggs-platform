# GG's Platform

A modern digital-talent and livestream website foundation: Next.js App Router,
strict TypeScript, pnpm, Roboto, and Spanish-default/English preview shells.

**Scope: WP-01 Project Foundation**, including the documentation and WP-02 handoff.
The delivery record tracks review/acceptance evidence for the staged work.
This is a disconnected foundation preview. HQ and streamer pages are public
structural previews, not authenticated workspaces. No live services, accounts,
database tables, business features, or deployment are included.

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
Stop at each PR boundary. Close WP-01 only after PR-05 review, merge, and acceptance.
Approve a concrete WP-02 brief separately before any WP-02 implementation.
