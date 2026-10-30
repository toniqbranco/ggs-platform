# Staging plan — preparation only

No staging account, hosted environment, DNS entry, service project, or deployment is
created by WP-01. This document is a reviewable plan for a later explicitly approved
staging deployment, not authorization to execute it.

## Ownership and scope

The repository owner selects the host, access gate, staging URL, and authorized
reviewers. Stage only the approved foundation commit. Public, HQ, and streamer routes
are structural previews; application authentication and authorization do not exist.
Staging must therefore use a hosting/edge access gate that restricts the entire site
to approved reviewers. A hard-to-guess URL or `noindex` does not provide access control.

Keep Supabase disabled and both service fields empty. No provider accounts, secrets,
production data, databases, tables, migrations, auth providers, or mail services are
needed for this foundation preview. A future approved service integration requires
separate staging resources and its own review; never reuse production credentials.

## Preconditions for an approved deployment

1. Review and merge the relevant PR, including its documentation and known limits.
2. Require passing **Quality and browser tests** and **Secret scanning** checks on the
   exact commit. Review any advisory changes; do not treat missing audit data as clean.
3. Select the supported Node 24 runtime with current security patches and the pinned
   pnpm release. Record the runtime, commit SHA, and lockfile in the release record.
4. Confirm hosting access restrictions and HTTPS before sharing the URL.
5. Build with the intended staging public origin. `NEXT_PUBLIC_` values are build-time
   values; changing a host variable afterward does not rewrite an existing bundle.
6. Keep logs limited to operational errors, with no credentials or personal data.

Example values (reserved domain only, not a real endpoint):

```dotenv
APP_ENV=staging
NEXT_PUBLIC_APP_URL=https://staging.example.invalid
NEXT_PUBLIC_SUPABASE_ENABLED=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Use `NODE_ENV=production` through the host's normal Next.js build/start behavior.
`APP_ENV=staging` is the deployment label, not an instruction to use Next.js dev mode.
The supported runtime is `pnpm start`; a standalone/custom server must explicitly
preserve environment validation and response headers before being approved.

## Acceptance at the future staging URL

- The access gate rejects unauthorized visitors before any preview content is served.
- All six localized routes render; ES/EN retains the current shell and document language.
- Unprefixed routes select Spanish and preserve query parameters; unknown paths return 404.
- Images and Roboto load from the same site. The deployed build has no unexpected
  external requests, Supabase sessions, subscriptions, auth callbacks, or service traffic.
- Security headers are present on actual edge responses, including `noindex`, frame
  restrictions, and the production CSP. Verify the host does not override them.
- Check desktop/mobile layouts, keyboard focus/skip link, reduced motion, zoom,
  browser console, and a manual Safari/Firefox/physical-device smoke pass.
- Confirm actual credentials and generated test reports are absent from the release.

The current static CSP restricts origins and embedding but permits inline Next.js
bootstrap scripts/styles. It is not a strict nonce-based XSS policy. Before accepting
untrusted/user-generated content, review nonce/hash-based CSP and rendering/caching
tradeoffs. Camera/microphone permissions and external connections are blocked in the
foundation and must be deliberately reviewed before livestream or auth integrations.
HSTS is not set for the local HTTP preview; configure and verify it at a future HTTPS
host after its TLS/domain policy is agreed.

## Release and rollback

After explicit deployment approval, record the source commit, host settings, test
results, reviewer, timestamp, and previous known-good release. Promote only that
reviewed build. Verify the acceptance list before inviting reviewers.

If the preview regresses, restore the previous reviewed build and configuration,
re-run smoke checks, and record the failing revision. There are no database changes
to roll back in WP-01. Do not repair a staging issue by enabling services, importing
production data, weakening the access gate, or deploying unreviewed code.
