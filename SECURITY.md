# Security policy for the project foundation

This is a prelaunch foundation, not an authenticated production platform. HQ
returns 404; streamer pages contain public pilot-entry information. Optional
server-only Auth targets the owner-approved testing project. Do not add private data until access
control and service integration have been separately implemented and reviewed.

See the [current Auth trust boundary and verification limits](docs/wp-02-sign-in.md).
Signing in grants no workspace authority. No private data may be served until
admission/role enforcement is reviewed. The provider still allows signup; the app
requests magic links with automatic user creation disabled.

## Reporting

Report sensitive findings to the repository owner through an existing private
channel, or GitHub private vulnerability reporting if it is available. Do not put
credentials, exploit details involving private data, or personal information in a
public issue. No dedicated security mailbox or reporting service has been created.

If a real credential is exposed, revoke/rotate it with the provider promptly. Merely
removing it in a later commit does not remove the credential from repository history.
Any history repair or provider/account changes require their own authorized action.

## Controls supplied here

- The WP-01 browser environment rejects privileged/legacy keys and enabling its factories.
  Browser/server markers separate the service factories; the factories throw before
  SDK creation or request-cookie access. They are not authentication or authorization.
- Production response headers restrict embedding, MIME sniffing, referrers, device
  permissions, indexing, and content origins. Framework branding headers are disabled.
- Static CSP permits inline scripts/styles required by the current prerendered Next.js
  pages. It is not a complete XSS defense; no untrusted HTML is rendered in this foundation.
- CI uses frozen lockfiles, a seven-day release-age policy, restricted dependency
  installation scripts, commit-pinned actions, and read-only GitHub token permissions.
- Dependency advisories at high/critical severity fail CI. Gitleaks scans repository
  history with redacted output; scans fail rather than silently accepting findings.

There is no database, RLS policy, live authentication, payment handling, deployment
credential, or production service to audit in this foundation. Before introducing
any of those, define authorization and data handling and add the appropriate tests.

## Verification and maintenance

Run `pnpm check`, `pnpm test`, `pnpm security:audit`, `pnpm build`, and `pnpm test:e2e`.
For local history scanning with the verified Gitleaks 8.30.1 CLI:

```sh
gitleaks git --redact --log-opts="--all" .
```

Use current supported runtime security patches, review advisories when dependencies
change, and keep manifests/lockfiles and action SHAs in the same reviewed change.
Scanner success is evidence for the scanned revision, not proof that all security
issues have been found. See [testing](docs/testing.md) and the
[staging plan](docs/staging-plan.md) for scope and release gates.
