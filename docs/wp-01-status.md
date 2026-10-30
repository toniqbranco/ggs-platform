# WP-01 delivery and acceptance

Status recorded on 2026-10-30. This document describes repository delivery, not a
production launch. PR-05 still requires its own review, merge, and passing checks.

## Staged delivery

| Stage                                                       | Delivered evidence                                                                                                                         | Review state                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [PR-01](https://github.com/toniqbranco/ggs-platform/pull/1) | Next.js App Router, strict TypeScript, pnpm lockfile, lint/format/development standards.                                                   | Merged.                                                  |
| [PR-02](https://github.com/toniqbranco/ggs-platform/pull/2) | Roboto, approved modern global creator visual direction, Spanish-default/English content, public/HQ/streamer previews, local imagery/font. | Merged after manual visual review and refinement.        |
| [PR-03](https://github.com/toniqbranco/ggs-platform/pull/3) | Environment contract and validation, separate browser/server helpers, disabled Supabase guard, empty database type contract.               | Merged.                                                  |
| [PR-04](https://github.com/toniqbranco/ggs-platform/pull/4) | Tests, CI, security controls, dependency policy, staging preparation.                                                                      | Merged after both hosted CI jobs passed.                 |
| PR-05 (this documentation change)                           | Documentation index, architecture/runbook, acceptance record, WP-02 handoff.                                                               | Review and merge pending; checks must pass before merge. |

## Verification baseline

The PR-04 source revision is
[`3951d2eb511a0666e805658428b637247ae40b36`](https://github.com/toniqbranco/ggs-platform/commit/3951d2eb511a0666e805658428b637247ae40b36).
Its [GitHub CI run](https://github.com/toniqbranco/ggs-platform/actions/runs/41102373297)
completed successfully for **Quality and browser tests** and **Secret scanning**.

- 39 unit tests and seven integration tests passed locally.
- 34 production HTTP/browser tests passed locally, including the six localized
  routes, desktop/mobile axe checks, keyboard navigation, narrow layouts, reduced
  motion, redirects, 404s, assets, and security headers.
- Production build, environment validation, strict type checking, lint, and formatting passed.
- The dependency audit reported no known vulnerabilities at the recorded check.
  Checksum-verified Gitleaks 8.30.1 found no leaks in staged changes or existing history.

These are revision-specific results, not an evergreen guarantee. The CI workflow
runs again for PR-05 and future changes. The test scope and known browser/accessibility
limits are documented in [testing](testing.md).

## Explicitly absent

No live account/project was created. No real Supabase service was connected. No
database table, migration, RLS policy, login/session flow, role-protected page,
recruitment/onboarding flow, or business feature was implemented. No staging or
production deployment was made. The current site remains a local/public-content
foundation preview; HQ and streamer names do not confer authorization.

Repository branch-protection and hosting access rules were not changed by WP-01.
Their enforcement must be checked before future release. The staging document is a
plan, not a configured environment.

## Closeout gate

- [x] PR-01 through PR-04 reviewed/merged in order.
- [x] Verified application and disconnected integration foundation recorded.
- [x] Tests/security checks and staging preparation documented.
- [x] Operational and next-package handoff documents prepared in PR-05.
- [ ] PR-05 CI passes on the review revision.
- [ ] PR-05 reviewed and merged.
- [ ] Owner accepts WP-01 closeout.

Do not convert the final three items into assumed approvals. A subsequent owner-approved
closeout can record the PR-05 evidence and acceptance. The handoff itself does not
authorize WP-02 coding or remove the disconnected-service guard. Approving WP-02 is
a separate entry gate, not a prerequisite for closing WP-01.
