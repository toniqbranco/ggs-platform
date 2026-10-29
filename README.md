# GG's Platform

WP-01 Project Foundation. Implementation proceeds through five separately reviewed PRs.

1. PR-01: application bootstrap and code standards.
2. PR-02: Roboto neutral design system, Spanish-default/English localization, public/HQ/streamer shells.
3. PR-03: environment validation and Supabase client/server boundaries without real services.
4. PR-04: tests, CI, security checks, and staging plan.
5. PR-05: documentation and WP-02 handoff.

Stop for review at each PR boundary. Business features, live accounts, database tables,
production connections, and deployment are outside this foundation's authorization.

## Local development

Use Node.js 24 (the validated version is in `.node-version`) and pnpm 11.25.0.
Install that pnpm version through your normal package-manager setup, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. No environment variables or service credentials are required.
The root route is a Spanish placeholder; localization and the visual system belong to PR-02.

## Code standards and validation

```sh
pnpm check
pnpm build
pnpm start
```

`check` runs ESLint with zero warnings, Next.js route type generation, strict TypeScript,
and Prettier checks. `build` independently verifies a production build. Run
`pnpm format` before committing and use `pnpm lint:fix` for fixable lint findings.
Use the committed pnpm lockfile; do not commit alternate package-manager lockfiles.

Application routes live in `src/app`; `@/*` resolves to `src/*`. Components are server
components by default. Add a client boundary only when browser behavior requires one.
TypeScript strict mode, checked indexed access, and exact optional properties are enabled.
ESLint uses Next.js Core Web Vitals and TypeScript rules; Prettier owns formatting.
Commit UTF-8 text with LF endings. Keep secrets and generated build output out of Git.

## Review gates

PR-01 contains only the bootstrap, developer commands, and code standards. Test suites,
CI automation, security checks, and the staging plan are scheduled for PR-04.
Each subsequent PR starts only after review of the preceding PR. PR-05 will consolidate
operational documentation and handoff prerequisites; WP-02 requires separate authorization.

### Tooling compatibility

The pinned ESLint 10 release is supported by Next.js 16.4's configuration. Some bundled
plugins still declare ESLint 9 peer ranges, so pnpm reports peer warnings. The lint check
passes with this combination; recheck compatibility when upgrading these packages.
