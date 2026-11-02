# Streamer setup preview

This implements the first stage of the [reviewed onboarding plan](streamer-onboarding-plan.md):
a proposed versioned policy contract and bilingual, disconnected screens. It changes
no live authentication, account, invitation, membership, profile storage or service
setting. The current sign-in callback still enforces existing admission.

## Manual review

With the local project running, open `/es/setup` or `/en/setup` directly. These
public demonstration routes contain only fixed fictional details; they are not
protected onboarding sessions and are not linked as working setup from sign-in.
Unprefixed `/setup` redirects to Spanish.

1. Confirm the visible preview notice. Password and confirmation fields are empty
   and disabled: do not enter a real password.
2. Choose **Ver paso del perfil / Preview profile step**. A private-profile layout
   shows fictional creator details; saving is disabled.
3. Switch ES/EN. The selected preview step stays the same. Go back to the password
   step using its link or the numbered step navigation.
4. Check a narrow mobile window. Neither step should overflow horizontally.
5. The sign-in link opens the existing email-link screen; no invitation, access or
   setup completion follows from viewing this preview.

Query parameters choose only `password` or `profile` display. They select no user,
role, verified state or access. No form, POST handler, browser SDK, secret input
handler or storage write exists. Password fields contain no sample password value;
profile details are text, not editable personal-data fields. Pages are dynamic,
no-store, no-referrer and excluded from indexing.

## Pure policy boundary

[The evaluator](../src/lib/pilot/onboarding.ts) accepts a strict, versioned proposed
record separate from existing `ggs_pilot` admission. It models subject/approver
binding, fresh verified identity, approval, accepted invitation, membership and
server-owned password/profile progress. It is used by unit tests only; no route
uses it to authenticate or grant access.

Pending membership can reach only the next incomplete setup step. Completing both
steps permits only a proposed finalization check; active membership and complete
setup are required for a streamer decision. Active users cannot repeat initial
setup mutations. Owner/admin records, mismatched identities, unverified sessions,
rejected approval, inactive invitations, suspension and unknown fields fail closed.

A passing pure decision is not a credential or a live authorization boundary.
Future adapters must establish fresh server identity, current application revision,
durable invitation binding and progress evidence. Expiry, revocation races,
transactional finalization and provider/database partial failures still need the
later persistence/Auth increments. Client profile metadata must never supply this
record, roles or step receipts. Existing owner/admin and session routes are unchanged.

## Verification and next gate

Unit tests exercise the setup/activation matrix and malformed/copied/stale-status
inputs. Browser tests cover both languages and desktop/mobile projects, disabled
credential inputs, no form/submission/provider request, display-only query flags,
step-preserving language switching, accessibility and narrow layouts. Existing
Auth, owner-review, storage and security suites remain required.

Stop for PR review. Next is invitation/persistence design and isolated verification,
not sending invitations or enabling password sign-in. The earlier real-owner
email/callback check remains unverified. Hosted schemas/grants, account changes,
profile retention, provider exchange/settings and activation need their own reviews.
No deployment is included.
