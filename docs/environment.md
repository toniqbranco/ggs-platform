# Environment and disconnected Supabase boundaries

WP-01 does not connect services. The website needs no credentials and works without
an environment file. `.env.example` is optional configuration documentation, not a
request to create a Supabase account or project.

## Variables

| Variable                               | Default                 | Meaning                                                                                                                                                                                   |
| -------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                              | `development`           | Server-only deployment label: `development`, `test`, `staging`, or `production`. It is independent of Next.js's `NODE_ENV`; a local production build can still use the development label. |
| `NEXT_PUBLIC_APP_URL`                  | `http://localhost:3000` | Reserved public application origin. It does not change the preview's port, routing, or metadata yet.                                                                                      |
| `NEXT_PUBLIC_SUPABASE_ENABLED`         | `false`                 | Only `false` is accepted in WP-01. Any attempt to enable it fails validation.                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_URL`             | Unset                   | Optional future project origin. Leave empty in WP-01.                                                                                                                                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Unset                   | Optional future publishable key with the `sb_publishable_` prefix. Leave empty in WP-01.                                                                                                  |

Blank strings count as unset. Both Supabase fields must be present together or absent
together. Providing them does **not** enable connections. Origins must use HTTPS, except
HTTP on `localhost`, `127.0.0.1`, or `[::1]`. Credentials, path segments, queries, and
fragments are rejected. This validates syntax only; no URL is contacted and no key is
checked against a real project.

Privileged `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` values are rejected.
Their `NEXT_PUBLIC_` equivalents and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also rejected.
The foundation uses the publishable-key contract and has no administrative client.

Only `.env.example` is committed. Keep `.env.local`, other `.env*` files, and actual
credentials out of Git. Never put a secret in a `NEXT_PUBLIC_` variable: public values
are embedded in browser assets at build time and require a rebuild when changed.

## Validation

`next.config.ts` validates the environment after Next.js loads its environment files,
so `pnpm dev`, `pnpm build`, and `pnpm start` reject invalid settings before serving.
The factories also validate when called. Errors list field names and controlled
messages; they do not log supplied values.

```sh
pnpm validate:env
pnpm validate:env --production
pnpm check
```

The standalone validation command uses `@next/env` and Next.js's normal precedence.
It selects development files by default and production files with `--production` or
`NODE_ENV=production`. `check` includes development environment validation. The actual
production build validates the production environment again through `next.config.ts`.
If a future deployment uses a standalone/custom server, its startup validation must
be wired explicitly; the current supported start command is `pnpm start`.

## Module boundaries

| Module                               | Responsibility                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `src/lib/env/schema.ts`              | Pure schemas and parsers; never reads process environment or contacts services.                                     |
| `src/lib/env/public.ts`              | Explicit, build-time-inlinable access to the four public fields only.                                               |
| `src/lib/env/server.ts`              | `server-only` access to validated server configuration.                                                             |
| `src/lib/supabase/client.ts`         | `client-only` browser factory using public configuration.                                                           |
| `src/lib/supabase/server.ts`         | `server-only`, per-request server factory with Next.js cookies. Uses a publishable key, not privileged credentials. |
| `src/lib/supabase/config.ts`         | Shared disconnected guard and `SupabaseDisabledError`.                                                              |
| `src/lib/supabase/database.types.ts` | An empty database contract; no tables, migrations, views, or functions exist.                                       |

The factories intentionally throw `SupabaseDisabledError` before SDK construction,
session initialization, request cookie access, or network activity. No page imports
them. There is no module-level client, shared server session, proxy, auth callback,
sign-in flow, API endpoint, query, subscription, or storage operation in this PR.

Enabling is a future **reviewed code change**, not an environment toggle. The SDK
constructor and cookie adapter code are scaffolding behind the guard. They are not a
complete authentication integration. Before enabling, separately implement and review
session refresh, writable cookie contexts, response propagation, authorization/RLS,
generated database types, and the approved service environment. Server-component
cookie write errors are not silently swallowed; future callers must use the correct
request context. Those changes are outside PR-03.

## References

- [Next.js environment loading and public variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Supabase browser and server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase JavaScript client options](https://supabase.com/docs/reference/javascript/initializing)

Supabase SDK and environment-tool versions are pinned in `package.json` and the pnpm
lockfile. `esbuild`'s local installation script is allowed because the `tsx` developer
command requires it. Other dependency build permissions remain unchanged.

## WP-02 optional server Auth

The WP-01 variables and browser factories above remain disconnected. The owner
approved a separate server-only Auth adapter for GG-livestream testing. See the
[current sign-in configuration and limits](wp-02-sign-in.md) for `PILOT_AUTH_ENABLED`,
`PILOT_SUPABASE_URL`, and `PILOT_SUPABASE_PUBLISHABLE_KEY`. Production is rejected;
default builds and CI stay disconnected.

## Owner bootstrap remains explicit

`PILOT_OWNER_USER_ID` optionally pins a reviewed existing owner Auth UUID. Missing
or empty values keep admission closed and the form unavailable; malformed values
fail validation. Selecting a UUID does not grant access by itself. A valid current
owner-approved admission record is also required. See the
[approval contract](wp-02-approved-access.md) before any live metadata/account changes.

## Application-storage proposal guard

`PILOT_APPLICATIONS_ENABLED` is server-only, defaults to `false`, and accepts only
the literal string `false`. Setting `true` fails startup validation. This proposal
adds no database connection variables or driver; no app route imports its adapter.
See the [unapplied storage proposal](../proposals/application-storage/README.md).
