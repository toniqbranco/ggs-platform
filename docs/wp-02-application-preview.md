# WP-02: application and private review rehearsal

## Scope

Following the explicitly approved PR #9 merge, the owner approved proceeding to
the next application/private-review preview. This increment builds the screens
and isolated rehearsal interactions. It creates no live applications, accounts,
invitations, metadata grants, tables, provider settings, or deployment.

The owner supplied evidence of successful real application sign-in after the
earlier browser mismatch and test-mailer quota issue. Real-browser sign-out,
refresh, and owner-only authorization have not been independently confirmed.
Local operational identities/configuration remain outside Git. Earlier PR-stage
documents describe the state at their delivery; this document supersedes their
unconfigured-owner status, without claiming a completed operational workspace.

## Routes and behavior

| Route                                        | Behavior                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/es/apply`, `/en/apply`                     | Public, explicitly fictional application rehearsal. Local validation only.                                                                      |
| `/es/hq/applications`, `/en/hq/applications` | Private owner-review rehearsal. Fresh owner-only server check before HTML/RSC; unavailable/unauthorized requests receive no preview.            |
| `GET /auth/review-preview`                   | Independent fresh owner-only check before returning fictional records. Private/no-store, no-referrer; preserves refreshed/cleared Auth cookies. |
| `/hq`, `/es/hq`, `/en/hq`                    | Still 404. No general dashboard or public HQ navigation.                                                                                        |

The public streamer entry links to the explicitly fictional form. ES/EN switching
preserves the form route. The private review uses a separate header, never the
public site navigation. Appointed admins and streamers cannot access the owner
review, even though appointed admins may separately pass the general HQ policy.

`src/proxy.ts` guards visibility only for the two exact private preview paths.
The data endpoint independently runs the existing `getUser()` and current trusted
admission policy with a fixed `pilot-management` target, ignoring client role and
area claims. No authorization decision from the proxy is reusable as a data permit.
Unknown paths contain no fixtures. Requests cannot switch the adapter to a weaker
target using query strings. No mutation endpoint is introduced.

## Application rehearsal

Fields are creator name, email, country, primary platform, and HTTPS profile URL.
Validation caps lengths, rejects unknown fields/role injection, and rejects profile
URLs containing credentials or unsafe schemes. Platform choices are illustrative;
country remains free text without an eligibility restriction.

The form is prefilled with fictional data, asks the reviewer to use fictional
details, and makes no submission/storage request. Inputs have no form names, so
an unhydrated native form cannot put their contents in a query string. No local
storage, analytics, cookies, email, or account creation records application data.
Reload resets the form. A successful check explicitly says nothing was submitted,
saved, or approved. A real intake endpoint must repeat server-side validation.

## Owner-review rehearsal

All three records are fictional and use reserved `example.invalid` addresses and
URLs. Their payload is served only through the protected endpoint, never embedded
in a public page or imported into a client component. Shared UI code/copy itself
is not confidential and can exist in browser bundles.

The owner can filter/select records and rehearse approval or rejection of a pending
application. Each action requires explicit confirmation; cancel changes nothing.
Decided records have no second decision action. Reset/reload restores fixture
state. Rehearsals live only in the tab, have no durable audit trail, and are not
represented as real approvals. Approval does not send an invitation, mark one
accepted, create a membership, or grant any role. Existing access is unchanged.

## Verification

Unit tests cover field/URL restrictions, injected approval, terminal rehearsal
states, fresh owner-only data authorization, suspension on the next request,
anonymous callers, and provider failure. Browser suites cover ES/EN forms, both
decision paths, cancel/reset/reload, mobile layout, accessibility, zero mutation
requests, and denial of visitor/admin/streamer HTML/RSC and data access.

The Auth browser-test server alone preloads
`tests/fixtures/review-auth-provider.ts`. It requires `APP_ENV=test` and an exact
fictional key, returns synthetic identities for SDK `getUser()`, and rejects all
other requests to the approved Auth origin. Application/startup code never imports
it. Test cookies and forged fixture JWTs are accepted only by this isolated mock,
not by real Supabase. No test provider or role selector is shipped in app routes.

## Next review gate

Validation on the review revision: 120 unit, 8 integration, 60 foundation/HTTP
browser, and 24 Auth browser tests pass (212 total), along with strict types,
lint, formatting, build, and documentation links. Screenshots were inspected at
desktop and mobile widths with fictional data. The dependency audit has no high
or critical advisories; it reports moderate `GHSA-g3hv-75wg-m249` in existing
development-only `minimatch` dependencies (ESLint tooling). It concerns crafted
glob input, not application form input. No dependencies changed here. Track an
upstream-compatible tooling update separately; do not force a major-version
override across ESLint's older dependency ranges without compatibility review.

Review this PR and its UI before another implementation increment. Keep live
submissions unavailable until the exact data model, audit storage, retention/privacy
notice, abuse controls, duplicate/concurrency handling, and testing-project
migration have been reviewed and separately approved. Live approval/invitation
operations must bind the verified recipient to the approved application, preserve
durable acceptance, handle delivery failures/retries, and deny partial activation.
They must not assume a database transaction can atomically commit an Auth HTTP call.

Reliable pilot mail still needs a separately selected/approved sending service;
one successful test login does not remove the built-in mailer's quota. No sending
domain or SMTP account is chosen here. Marketing expansion, attendance, Academy,
commerce, payouts, platform integrations, production, and deployment remain later.

References: installed Next.js authentication, route-handler and Proxy guides;
[Supabase server-side session guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
[metadata trust and JWT freshness](https://supabase.com/docs/guides/database/postgres/row-level-security#authjwt).
