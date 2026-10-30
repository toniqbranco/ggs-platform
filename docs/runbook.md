# Local development and handover runbook

## Fresh checkout

Use Node.js 24 (`.node-version` records the validated local patch) and the
`packageManager` pnpm version in [package.json](../package.json). GitHub Actions uses
those repository settings. Install the supported tools through your normal setup.

```sh
git clone https://github.com/toniqbranco/ggs-platform.git
cd ggs-platform
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`; `/` redirects to `/es`. No environment file or service
credentials are needed. If documenting local overrides, copy `.env.example` to
`.env.local`, keep the Supabase fields empty/disabled, and leave `.env.local` ignored.
Do not place an environment file inside `src`.

## Production-mode local preview

```sh
pnpm build
pnpm start --hostname 127.0.0.1 --port 3103
```

Open `http://127.0.0.1:3103/es` or `/en`. This is local preview, not hosting or
deployment. `pnpm start` serves the last completed production build. After changing
source, stop it with Ctrl+C, rebuild, and start it again. Use `pnpm dev` for automatic
updates while editing.

## Before review

```sh
pnpm check
pnpm test
pnpm security:audit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The [testing guide](testing.md) explains installation, test scope, CI, and reports.
E2E tests reserve port 3104 and manage their own server. They do not reuse the manual
preview on port 3103. Inspect `git status` before committing; generated output and
local environment files should not be included. GitHub checks must pass on the PR
revision before merge.

## Common issues

| Symptom                                                       | Action                                                                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port already in use                                           | Stop the known process you started, or choose a different manual-preview port. Do not terminate unrelated applications. Keep 3104 available for E2E.                        |
| Start reports no production build, or an older design appears | Run `pnpm build` after editing, then restart `pnpm start`; use dev mode for live edits.                                                                                     |
| Environment validation fails                                  | Read the field name and [environment contract](environment.md). Correct the local value; do not turn on services, add privileged keys, or log actual values.                |
| `SupabaseDisabledError`                                       | Expected in WP-01. The preview should not call the factories. Integration requires a separately approved change.                                                            |
| Frozen-lockfile mismatch                                      | Check that the branch's manifest and lockfile were checked out together. Resolve intended dependency changes in a reviewed update, not by disabling frozen CI installation. |
| Dependency age policy rejects a new resolution                | Select a version that meets the policy. If a security patch genuinely needs an exception, document the exact version/reason for review. Do not use a broad bypass.          |
| Browser executable is missing                                 | Run the pinned `pnpm exec playwright install chromium`; Linux may also need `--with-deps`.                                                                                  |
| Browser test fails                                            | Inspect its error, screenshot, and trace; use `pnpm test:e2e:report` for the HTML report. Fix the cause rather than disabling an accessibility or security assertion.       |
| Windows blocks generated-file creation or dependency links    | Retry using the approved local access/runtime setup for this workspace. No production service or credential is needed to fix a local file permission.                       |
| GitHub CI remains queued                                      | Keep the remote result pending. Do not equate successful local tests with completed hosted CI or merge past a required failing/pending check.                               |

## Local rollback

Keep changes on a branch and review `git diff`. Restore an earlier reviewed version
through an ordinary reviewed Git change; do not discard another person's local
changes or rewrite shared history as a routine fix. Rebuild the selected revision
before restarting the preview. There are no WP-01 database migrations or service
resources to roll back. A future hosted rollback follows the separate
[staging plan](staging-plan.md).
