# Approved streamer first access — review proposal

## Status and scope

This is a design-only increment following merged PR #23. The owner requested a
password/profile step after first email verification, then asked to proceed to
the next review. This document proposes that change; it activates no feature,
changes no Auth setting and authorizes no invitation, account, schema or data write.

Current code remains authoritative: sign-in uses existing-account-only magic
links; the [admission contract](wp-02-approved-access.md) requires approved,
accepted and active membership. The [private application queue](owner-storage-review.md)
is read-only. Approval of an application does not create an Auth account or role.
The top-right Sign in button opens the existing localized sign-in screen.

The intended journey is:

**Application → owner approval → controlled invitation → verified email →
password setup → private profile completion → admitted streamer entry.**

Later streamer visits use email and password. Setup is not repeated on every
sign-in. Owner/admin login remains unchanged by this streamer proposal. HQ has
no public navigation and remains a separate private administration area.

## Access and state transitions

These are proposed application states, not new values already accepted by the
current strict version-1 admission parser. Introduce a separately versioned,
server-owned onboarding record; do not add fields to the existing record silently.

| State                                                     | Permitted behavior                               | Transition authority                                                |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| No account, pending/rejected application                  | Public information only; sign-in creates nothing | Existing application review process                                 |
| Approved application, no invitation                       | No setup or workspace access                     | Separately authorized owner invitation operation                    |
| Invitation issued, not verified                           | No private setup data                            | Provider verifies the invitation; server checks its current binding |
| Verified, setup incomplete                                | Own password/profile setup and sign-out only     | Restricted onboarding authorization                                 |
| Password accepted, profile incomplete                     | Resume own profile setup; no workspace           | Server-recorded setup progress                                      |
| Setup complete, membership pending                        | Completion receipt only; no workspace            | Idempotent server finalization after all fresh checks               |
| Accepted invitation, active membership, complete setup    | Streamer entry only with explicit streamer role  | Existing admission plus new setup-completion gate                   |
| Revoked, expired before acceptance, rejected or suspended | No setup mutations or workspace                  | Current server state overrides an old cookie or link                |

The invitation record must bind the reviewed application revision, intended Auth
subject, owner approval, expiry and operation identifier. Email strings alone do
not establish that binding. Existing accounts require a reviewed attach/reinvite
path; never overwrite an account, merge identities or replace its roles by email.
Expired unused invitations differ from accepted invitations: expiry of the old
link must not eject a legitimately admitted participant.

Keep membership pending during setup. A verified email, completed form or password
update must never independently activate membership or grant owner/admin roles.
Finalization rechecks approval, accepted invitation, subject, role, password-step
receipt and validated profile. It must be retry-safe and refuse stale revisions.
Revocation racing with finalization must win through the reviewed consistency
boundary; do not activate using a stale snapshot.

## Entry routes and provider integration

Proposed localized routes are `/es/setup` and `/en/setup`, with password and
profile steps inside that flow. A restricted server endpoint authorizes every
setup read/write using fresh provider identity and current onboarding authority.
Anonymous users see sign-in instructions; unrelated verified users receive no
profile information. Direct API calls enforce the same checks as pages.

Do not redirect pending users through the current generic callback unchanged:
[Auth flow](../src/lib/auth/flow.ts) deliberately signs out identities that fail
existing admission. Add a separately reviewed invitation verification path which
can establish setup-only access without weakening ordinary callback, session,
owner/HQ or workspace checks. An arbitrary successful magic link is not durable
invitation acceptance.

Before selecting a provider exchange, prove the exact invitation behavior with
the pinned SDK and an isolated Auth fixture. Do not assume an operator-issued
invitation carries the recipient browser's PKCE verifier or that URL fragments
reach the server. A server token-hash exchange, if selected, needs its own threat
review, token-type allowlist, link-scanner behavior, replay tests and exact email
template/redirect approval. Preserve the existing PKCE flow until its replacement
is explicitly reviewed; never fall back to accepting unverified browser tokens.

Return paths come from fixed configured origins and supported locales, never
`next`, Host or forwarded-host input. Auth/setup pages are dynamic, private/no-store
and no-referrer. Tokens/passwords stay out of logs, analytics, URLs generated by
forms and persisted browser storage. Sensitive email links require review of
infrastructure access-log redaction as well as application logging.

## Password, returning sign-in and recovery

Propose a 12-character minimum, password-manager support and paste/autofill with
appropriate `new-password` / `current-password` hints. Final maximum/byte and
Unicode rules must be verified against the pinned provider before coding; do
not truncate or invent stronger server enforcement than the provider supports.
Show confirmation and an accessible reveal control without retaining either
field after submission. Localized errors must not echo the password.

Only Supabase Auth stores the password. Use the verified user's Auth operation,
never a password column, owner-readable field or privileged password reset.
Record only a server-owned step receipt after confirmed provider success.
If Auth succeeds but progress persistence fails, leave membership pending and
provide a safe retry/reconciliation path. A client `passwordSet` flag, metadata
edit, timestamp inference or successful form submission is not proof.

Returning password sign-in must verify identity and current admission/setup after
provider authentication. Wrong credentials, unknown accounts and restricted
accounts get generic public responses; authenticated setup-incomplete streamers
can resume only their own setup. Owner/admin behavior must not be silently routed
into streamer setup. Rate limits and bounded same-origin POST handling apply to
login, setup, reset and invitation/resend operations.

Recovery is required before enabling password sign-in. A reset request gives a
generic result, sends no account-creation request and grants no admission. Verified
recovery may update only that subject's password; it cannot approve, reactivate,
change contact email or complete profile/setup. Review current-password and
recent-session/reauthentication settings separately for first setup versus later
password changes. Define session revocation after recovery and test its practical
limits, including already-issued access tokens.

Provider password hardening, leaked-password protection availability, security
notifications, reliable invitation/recovery email delivery and abuse protection
are activation gates. This document approves no plan upgrade or hosted setting.
The prior real-owner email/callback incident remains unverified; this proposal
does not establish that a fresh link can currently complete sign-in.

## Minimal private profile proposal

Reuse application details only after the account/application binding is proven;
do not fetch someone else's application by a supplied email. Proposed required
fields are display name, preferred language (`es` / `en`), country, primary
platform and public creator-profile URL. Reuse the existing application bounds
and platform enum where compatible, then review profile-specific validation.
Auth email is shown read-only as identity, not copied into an editable role field.

No phone, street address, birth date, government ID, payment details, biography,
avatar upload or public profile publication belongs to this first increment.
The profile is private; preferred language does not grant authority. Marketing
consent cannot be a required setup checkbox or be bundled with access.

Before persistence, review schema/ownership, private-schema exposure, FORCE RLS
and least-privilege routines, self-only access, owner support visibility, audit
redaction and retention. Existing intake/review logins are not permission to add
onboarding grants. Do not extend the frozen applied migration; use a separately
reviewed new migration if approved. No new migration is included here.

The selected application retention draft is not automatically a profile policy.
Resolve abandoned setup, active/suspended profiles, erasure, backup handling and
verified correction requests before collecting real profile data. Preserve the
existing fictional application and history; it is not a real streamer invitation.

## Bilingual setup outline

| Step                  | Spanish                                                       | English                                                     |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Welcome               | Configura tu acceso                                           | Set up your access                                          |
| Explanation           | Crea tu contraseña y completa tu perfil para continuar.       | Create your password and complete your profile to continue. |
| Password title/action | Crea tu contraseña / Guardar y continuar                      | Create your password / Save and continue                    |
| Profile title/action  | Tu perfil de streamer / Completar configuración               | Your streamer profile / Complete setup                      |
| Incomplete setup      | Continúa donde lo dejaste.                                    | Continue where you left off.                                |
| Restricted access     | Tu acceso aún no está disponible. Contacta al equipo de GG’s. | Your access is not available yet. Contact the GG’s team.    |

Extend the existing Roboto, neutral palette and shared controls. Show two clear
steps, keyboard-visible focus, associated errors and password-manager support.
ES remains default; EN retains the current step. Never expose HQ in public setup
navigation. A success state must describe actual access; do not promise tools
that have not been built.

## Reviewed implementation sequence

Each increment stops at its own PR boundary; these are proposed stages, not
permission to run all of them after this document merges.

1. **Policy and disconnected UX:** versioned setup contract, pure access matrix
   and bilingual preview screens using fictional fixtures. No active password
   submission or private profile storage. Existing owner/admission tests stay green.
2. **Invitation and persistence design:** exact account binding, operation/audit
   model, grants/RLS, profile retention and failure reconciliation; isolate and test
   any new migration. Privileged provisioning stays outside the website runtime.
3. **Fixture-backed Auth and setup:** restricted verification, password/progress
   writes, profile finalization, returning password login and recovery, default off.
   Test against the pinned SDK; use no real accounts, messages or hosted writes.
4. **Separate testing activation:** review exact target, schema/grants/settings,
   credentials, approved test recipient and email sends individually. Then verify
   real end-to-end invitation, resume, sign-in, recovery and revocation. Opening
   public intake, operational workspaces and deployment remain later gates.

Required tests include anonymous/unapproved/wrong-subject denial; forged
user metadata; direct API bypass; copied, expired, used and revoked invitations;
same/new-browser verification; owner/admin regression; suspended/revoked access
with an unchanged cookie; weak/wrong-password behavior; provider/database partial
failure; duplicate finalization; revocation races; recovery without promotion;
self-only profile reads/writes; CSRF/open redirects; sensitive-log exclusion;
ES/EN accessibility and 320px layouts. Browser/SDK fixtures are not proof of real
email delivery or hosted permissions.

Rollback first disables the new feature and denies setup/password routes; keep
existing owner login working. Disable/revoke newly approved runtime authority
through a separate operation if needed. Preserve profiles/audit records and
reconcile partially completed operations; do not delete accounts or reset
passwords automatically to simulate rollback.

## References checked

Provider documentation and changelog were checked during this proposal. The
markdown changelog endpoint was unavailable through the browser reader; the HTML
index was inspected instead. No relevant change authorizes weakening the current
server boundaries. Recheck current docs at implementation time.

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Password security and reauthentication](https://supabase.com/docs/guides/auth/password-security)
- [Invitation API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Email templates and token variables](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Passwordless account-creation control](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase changelog](https://supabase.com/changelog)
