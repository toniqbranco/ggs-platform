# GG's Platform

A modern digital-talent and livestream website foundation: Next.js App Router,
strict TypeScript, pnpm, Roboto, and Spanish-default/English preview shells.

**WP-01 is closed. Current increment: WP-02 / PR-02, testing-project sign-in and sessions.** The owner approved the recommended pilot-access package.
Streamer routes provide public invitation-only entry information.
HQ is reserved for the owner and appointed admins; its routes return 404 until
private authentication and authorization are implemented. Optional server-only
email-link sign-in targets the owner-approved GG-livestream testing project.
No account, database table, project setting, production service, or deployment has been added.

[Current sign-in scope and verification limits](docs/wp-02-sign-in.md) ·
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
protect an admin workspace; the HQ preview is disabled entirely.

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
WP-01 is closed following PR-05 merge/acceptance. The owner approved WP-02's
closed-pilot access package. Its first access-model/UX PR is merged. The owner approved the testing-project
sign-in increment; stop at its PR for review before workspace authorization,
account creation, or schema changes. Review boundaries and service permissions remain explicit.
