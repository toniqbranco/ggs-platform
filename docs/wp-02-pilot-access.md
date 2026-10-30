# WP-02: closed-pilot access — first increment

The owner approved the proposed package after WP-01 closeout on 2026-10-30. This
increment establishes the access contract, disconnected entry/restricted UX, and
fixture-based tests. Live accounts, service connections, schema changes, and
deployment are not authorized by this increment.

## Initial access matrix

| Actor / assigned role | Public site | HQ                                           | Streamer                                      | Invite, approve, assign roles, suspend, revoke |
| --------------------- | ----------- | -------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Visitor / none        | Available   | No pilot access                              | No pilot access                               | No                                             |
| `owner`               | Available   | Allowed after admission/session requirements | Only with explicit additional `streamer` role | Owner-only authority                           |
| `hq_staff`            | Available   | Allowed after requirements                   | Only with explicit additional `streamer` role | No                                             |
| `streamer`            | Available   | No                                           | Allowed after requirements                    | No                                             |

This conservative matrix is the reviewable starting policy, not an implemented
permission service. No product identities exist. GitHub ownership does not seed an
application role, and first signup must not automatically become owner. First-owner
bootstrap or delegated management requires review before live integration.

Access requires a valid session, accepted invitation/admission, active membership,
and an explicit role for the target. No public signup or automatic approval is
allowed. Multiple explicit roles may grant multiple areas; no role implies
impersonation or another role. Workspace entry does not itself define ownership of
data inside that workspace.

Accepted invitation means the durable admission record, not an unexpired one-time
token. Expiry of an unused invitation differs from session expiry. Revocation and
membership suspension must invalidate later live access.

## Policy model and trust boundary

The pure [policy evaluator](../src/lib/pilot/policy.ts) validates status/role input
and fails closed on unknown roles/targets, malformed fields, and extra admin flags.
Absent/expired sessions are rejected before admission/role evaluation. Other denial
reasons cover inactive/missing invitation, pending/suspended membership, and wrong role.

**This is not a session verifier or live authorization boundary.** No route uses the
evaluator to authenticate a visitor. A future approved server adapter must bind
verified identity to authoritative admission/membership/role records. Cookies,
query flags, local storage, editable profile metadata, and fixture data are not
trusted role authorities. Route and data enforcement must not depend on navigation UI.

[Test fixtures](../tests/fixtures/pilot-identities.ts) contain only synthetic status
flags, with no accounts, emails, IDs, credentials, or tokens. App routes never import
them. No role selector, query-driven identity, or fixture-login backdoor exists.

## Public entry UX

| Route                                    | Current behavior                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `/es/hq`, `/en/hq`                       | HQ invitation-only entry information; no private workspace/account data.            |
| `/es/streamer`, `/en/streamer`           | Localized streamer entry information with the same admission policy.                |
| `/es/pilot`, `/en/pilot`                 | Invitation policy and planned audiences.                                            |
| `/es/access-denied`, `/en/access-denied` | Generic, explicitly previewed restricted message, not a personal account diagnosis. |

Sign-in is visibly unavailable. No credential fields, submissions, invite emails,
enrollment requests, or authentication requests are implemented. Policy/home links
work; ES/EN retains the current page. New unprefixed information routes temporarily
redirect to Spanish and preserve query parameters.

These are public informational pages returning 200. The restricted-message route
is a UX state, not an enforced HTTP 403 or protected resource. Browser role/approval
flags and return URLs cannot activate sign-in or redirect outside the site. Supabase
and the existing CSP restrictions remain unchanged.

## Verification and next review

Keep the original foundation tests. New tests cover the role matrix, inactive/invalid
contexts, both translations, entry/denied navigation and accessibility, narrow layouts,
and ignored untrusted browser state. No real service is required.

Stop at this PR for access-model/UX review. Before increment two, confirm the matrix
and invitation lifecycle, select sign-in/recovery/session behavior, and approve the
exact non-production Supabase project and any schema/RLS. Review the disconnected
guard only alongside tested session/cookie/authorization implementation.

Commerce, inventory, payouts, rankings/badges, live-platform APIs, analytics extraction,
Academy modules, production resources, and deployment stay outside this package.
