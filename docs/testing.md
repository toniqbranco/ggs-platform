# Foundation verification

The [storage proposal](../proposals/application-storage/README.md) adds
`pnpm test:storage`, included in `pnpm test`. It executes the quarantined migration
and server-only adapter against ephemeral PGlite, not GG-livestream. It needs no
database credentials. PGlite uses PostgreSQL 18.6 and one connection; PostgreSQL
17.11, real multi-connection races and Supavisor/TLS remain live-application gates.
Startup tests also prove `PILOT_APPLICATIONS_ENABLED=true` is rejected. No CI job
applies proposal SQL or provisions any real role.

## Local commands

Use the Node/pnpm versions documented in the repository, then:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test
pnpm security:audit
pnpm build
pnpm test:e2e
```

The browser install is needed once per Playwright browser version. On Linux runners,
use `pnpm exec playwright install --with-deps chromium`. Dependency auditing contacts
the npm registry; unavailable advisory data must not be interpreted as a passing audit.

`test:e2e` starts its own production server on `127.0.0.1:3104` and shuts it down after
the run. Build first. It does not reuse the manual preview on port 3103 or accept an
external base URL. If port 3104 is already occupied, stop that test server before
retrying rather than testing an unknown process.

## What the suites cover

| Suite           | Command                                            | Coverage                                                                                                                                                                           |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | `pnpm test:unit`                                   | Safe environment defaults, invalid origins, secret/legacy-key rejection, paired configuration, error redaction, locale paths, complete translations, and disabled browser factory. |
| Integration     | `pnpm test:integration`                            | Server factory fails before request context, no fetch calls, wrong-runtime import rejection, and invalid Next.js build/start settings.                                             |
| Production HTTP | `pnpm test:e2e --project=http`                     | All six pages, security headers, Spanish-default redirects with query preservation, unsupported routes, original artwork size/type, and font license.                              |
| Browser         | `pnpm test:e2e --project=desktop --project=mobile` | Six localized shells, language/shell navigation, real CTA anchors, keyboard skip link, reduced motion, narrow-screen overflow, working imagery, and axe WCAG A/AA checks.          |

Browser fixtures abort unexpected external requests and fail on those attempts,
JavaScript errors, or console/CSP errors. Tests use reserved `.invalid` URLs and
artificial keys only. No test queries a database, calls a real Supabase service, or
requires a service account. The disconnected factories remain guarded.

The WP-02 first increment adds status-only pilot-policy fixtures, role/admission
matrix tests, and entry/information/restricted-state browser checks. These verify
the disconnected contract and public UX, not working session verification, RLS,
or real authorization. Query/cookie/local-storage flags cannot enable the entry UI.
See [pilot-access scope](wp-02-pilot-access.md).

Automated accessibility checks cover detectable issues, not complete accessibility
conformance. Manual review still covers screen-reader flow, zoom, reading order,
touch targets, visual balance, and real device/browser behavior. Chromium desktop and
mobile emulation are the automated baseline; Firefox, Safari, and physical-device
coverage are future expansion, not a claimed result of this suite.

## CI

`.github/workflows/ci.yml` runs on pull requests, pushes to main, and manual dispatch:

- **Quality and browser tests:** frozen installation, validation/lint/types/format,
  unit/integration tests, dependency audit, production build, and browser tests.
- **Secret scanning:** Gitleaks against repository history. The current personal
  repository needs no Gitleaks organization license. Revisit licensing if ownership
  moves to an organization; do not bypass the scan.

Actions are pinned to full commit SHAs. Node is selected from `.node-version`, pnpm
from `packageManager`, and browser versions from the committed Playwright dependency.
The workflow has read-only repository permissions, does not persist checkout
credentials, and has no deployment steps or production secrets. It uses
`pull_request`, not `pull_request_target`.

Failed browser reports/traces are retained for seven days; successful runs upload no
reports. Open local reports with `pnpm test:e2e:report`. Inspect diagnostics before
sharing them: future tests involving private data may record that data in traces.
Never add actual credentials to fixtures.

Configure both job names as required checks in repository branch protection when
ready to enforce them. This PR supplies the workflow; it does not change repository
access rules or claim branch protection is already enabled. CI must pass on the
actual PR revision before merge.

## Updating tools

Keep package manifests and the lockfile together. New resolutions have a seven-day
minimum release age, and only esbuild's required local installation script is
allowed. Do not add a broad age exception or enable arbitrary lifecycle scripts to
silence an install failure. Security patches requiring a narrower exception need a
specific rationale and review. Update action pins only after verifying the upstream
release and its commit. Re-run the relevant suites after dependency changes.

## Public/admin map regression

Public pages in both languages must contain no HQ text or HQ links. `/hq`,
`/es/hq`, and `/en/hq` return 404, including owner/admin claims in browser cookies
or query strings. HQ stays unavailable until server-side authorization is approved.
The policy fixtures allow only owner/appointed-admin roles for future HQ access;
streamers and the retired `hq_staff` role cannot authorize HQ.

## Pilot sign-in tests

`pnpm test:e2e:auth` runs the second browser suite on port 3105 with synthetic
server-only Auth configuration; it never sends a real link or creates an account.
Run after `pnpm build`. The normal 3104 suite explicitly disables pilot Auth. Both
run in CI. Unit/SDK integration tests verify synthetic PKCE exchanges, refresh,
revocation, cookie/cache headers, local sign-out, and no workspace access. See
[sign-in verification limits](wp-02-sign-in.md) before testing actual delivery.

## Approval enforcement

Admission tests bind owner approval to verified identity, deny inactive/rejected
records, and preserve role boundaries. The SDK fixture mutates mocked server Auth
metadata while retaining the same browser state; subsequent checks must deny a
suspended participant. Browser suites cover approval-required messages in both
languages and reject forged owner claims at `/auth/access`. No real account or
metadata is changed by tests. Live identities stay outside the repository.

## Application and private review preview

The [preview contract](wp-02-application-preview.md) describes the current routes.
Auth browser tests preload a test-only mocked provider with a fictional key and
synthetic session cookies. They exercise the real SDK/server guard and UI without
sending email or mutating Auth. Owner-only checks apply separately to HTML/RSC and
fixture data; admin/streamer/anonymous identities are denied. Application and
decision rehearsals make no mutation requests and reset on reload.

Run the two browser suites sequentially, as CI does. Both use the default
Playwright report/artifact directories, so concurrent runs can delete each other's
trace files. Successful automated tests do not prove real mail delivery or a real
owner's complete refresh/sign-out cycle.
