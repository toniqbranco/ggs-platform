# Foundation verification

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
