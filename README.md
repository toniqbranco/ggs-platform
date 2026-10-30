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
The root route redirects to `/es`. English is available at `/en`.

## Foundation shells and localization

| Space    | Spanish (default) | English        |
| -------- | ----------------- | -------------- |
| Public   | `/es`             | `/en`          |
| HQ       | `/es/hq`          | `/en/hq`       |
| Streamer | `/es/streamer`    | `/en/streamer` |

Unprefixed `/hq` and `/streamer` redirect to the Spanish versions. These temporary
redirects preserve query parameters. Browser language does not override the Spanish
default. ES/EN links retain the current space; the URL is the language preference.
Unsupported locale prefixes and unknown routes return 404.

`src/lib/i18n/config.ts` defines the supported locales and shell paths.
`src/lib/i18n/dictionaries.ts` keeps the translated content and metadata in dictionaries
with the same checked TypeScript shape. Add new interface copy to both dictionaries.
The locale layout sets the document language and prerenders both languages.

`src/app/globals.css` defines neutral color, spacing, radius, and typography tokens,
with restrained lime accents for the global talent and livestream visual direction.
The homepage adds editorial creator artwork and a static brand-perspective section.
Image provenance, generation prompt, and visual choices are in [design notes](docs/design-direction.md).
Subtle motion respects `prefers-reduced-motion`; all imagery and fonts are served locally.
`src/components/ui` contains shared status badges and content panels; `Shell` composes
the header, navigation, skip link, main landmark, and footer. Navigation exposes active
states, visible keyboard focus, and touch targets of at least 44 CSS pixels. The header
reflows for narrow screens. These preview shells contain no authentication or role gates,
private information, recruitment, forms, dashboards, or business actions. They must not be
treated as protected areas until authentication and authorization are implemented later.

Roboto is loaded through `next/font/local` from the pinned `@fontsource-variable/roboto`
package (SIL Open Font License, also served at `/fonts/roboto-OFL.txt`). Only the Latin variable upright
font is loaded; it covers the Spanish and English interface. The build and browser do not
contact Google Fonts. Revisit subsets and styles before adding other scripts or italics.

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
