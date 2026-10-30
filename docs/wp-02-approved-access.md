# WP-02 / PR-03: owner-approved application admission

## Scope and current delivery

The owner approved merging PR #7 and proceeding with the access-control stage on
2026-10-30. PR #7 is merged at `14e13e7008b61e101b405e1557a49413c512e8f3`.

The required journey remains **apply → owner review → approval → invitation
accepted → sign in**. This increment enforces the admission boundary. It does not
build application intake, a review dashboard, automatic invitation acceptance,
or approval-management operations. Those flows must produce the trusted record
described below before a real participant is admitted.

No real owner UUID has been selected and no real admission records were written.
The current local preview therefore admits nobody and shows sign-in as closed.
This is intentional, not a fixture login or automatic first-owner bootstrap.

## Rules enforced on the server

- Email verification alone cannot admit a participant.
- Approval must be `approved`, the invitation `accepted`, and membership `active`.
- Missing, pending, rejected, revoked, expired, suspended, malformed, or wrong-role
  admission fails closed.
- Streamers can pass only the streamer authorization check. HQ requires owner or
  appointed admin; admission/role management requires owner. Additional roles must
  be explicitly assigned; no role implies impersonation.
- Only the explicitly configured owner identity may hold the `owner` role. GitHub
  login, first signup, editable profile data, and browser claims never select it.
- Auth callback and every session/access request fetch the user through server
  `getUser()` and read current server-managed metadata. They do not authorize from
  cookie/JWT metadata or a cached role snapshot. Suspension/revocation is checked
  again on the next request without waiting for a browser JWT to refresh.

The application uses the existing Auth `app_metadata` field for this small pilot
contract. Users cannot edit that field through profile-update APIs. No extra table,
SQL function, service-role key, browser SDK, or public membership list is introduced.
The application contains no endpoint that writes approval or grants a role.

## Trusted admission contract

Server configuration `PILOT_OWNER_USER_ID` must explicitly identify an existing,
separately reviewed owner Auth UUID. Empty/unset means **deny every admission**;
the sign-in form stays unavailable and link requests do not call the provider.
Malformed IDs fail environment validation. A configured ID alone grants nothing:
the owner also needs a valid admission record and verified session.

The fresh user returned by Auth must have a verified email, must not be anonymous,
and must contain this versioned object under `app_metadata.ggs_pilot`:

| Field         | Required meaning                                                                          |
| ------------- | ----------------------------------------------------------------------------------------- |
| `version`     | Exact number `1`.                                                                         |
| `subject`     | Exact Auth UUID of the verified user; records cannot be copied between accounts.          |
| `approved_by` | Exact configured owner UUID. Delegated approval is not authorized in this matrix.         |
| `approved_at` | Valid UTC timestamp no later than server time.                                            |
| `approval`    | `pending`, `approved`, or `rejected`; only `approved` admits.                             |
| `invitation`  | Existing invitation lifecycle; only durable `accepted` admission admits.                  |
| `membership`  | `pending`, `active`, or `suspended`; only `active` admits.                                |
| `roles`       | Explicit array of `owner`, `admin`, and/or `streamer`; unknown fields/roles are rejected. |

This is a reviewed **read contract**, not permission to write metadata now. Later
owner bootstrap and approval/invitation operations must verify the operator,
preserve audit evidence, and be reviewed before use. Do not put the object in
`user_metadata`, accept it from a form, infer approval from an email domain, or
turn a successful magic link into automatic invitation acceptance. The `accepted`
state must already be the trusted record of invitation acceptance.

## Route behavior

| Route                     | Current result                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/sign-in`      | Existing-account-only link request; no provider request until owner bootstrap is explicitly configured. Generic replies avoid account enumeration.                                                    |
| `GET /auth/callback`      | Exchanges/verifies the link, then checks admission. Denied users go to localized approval-required instructions.                                                                                      |
| `GET /auth/session`       | Approved users receive `authenticated: true`, `approved: true`, `workspaceAccess: false`. Unapproved users receive a generic restricted state. No personal data is returned.                          |
| `GET /auth/access?area=…` | Protected authorization probe for `hq`, `streamer`, or `pilot-management`: 200 when allowed, 401 without a session, 403 when denied, 400 for unknown targets. No workspace data or permission editor. |
| `/hq`, `/es/hq`, `/en/hq` | Remain 404, with no public navigation links. Actual HQ UI is still unavailable.                                                                                                                       |

Callbacks/session checks attempt to sign out a denied provider session and always
expire this project's browser token/verifier cookies, including token chunks.
Newly exchanged tokens cannot be returned to a rejected participant, even if
provider sign-out fails. Provider failure may leave a server-side session until
it expires; every subsequent app request still denies access.

Wrong-role requests from an otherwise approved participant return 403 without
destroying their valid session. All Auth responses remain private/no-store, with
server cookie handling and no-referrer. The authorization probe is not a reusable
permit: future handlers must run the same fresh server check inside each protected
operation before returning data or making changes.

`workspaceAccess: false` remains deliberate because no operational dashboard or
private business data is served by this PR. Do not treat a session-status page or
an authorization probe as a completed streamer/HQ product.

## Provider boundary and next gate

These controls govern **GG's application entry**. They do not change the Supabase
project's Auth configuration. The earlier read-only check observed project-wide
signup enabled. A direct provider login or link email is not GG's approval; the
application rejects unapproved users even when the provider verifies their email.
Review provider signup/hook settings separately before admitting real pilot users.

This PR changes no accounts, grants, Auth settings, schema, RLS, production service,
or deployment. The public-table inventory was read-only and reported no tables.
There is no database business data to expose in this increment. Future business
tables still require an approved schema and RLS; UI/session checks are not a
substitute for database enforcement.

Next: review this PR, explicitly identify/bootstrap the owner, agree on the
application/review/invitation workflow and audit storage, authorize any account or
provider-setting changes, and verify a real approved test account. Real email
delivery and approval/revocation were not tested against real identities here.
Public marketing pages and later operational modules remain at their roadmap stages.

## Verification

Unit tests exercise the admission/role matrix, missing owner, forged profile
metadata, wrong subject/approver, pending/rejected applications, inactive admission,
callback cookie cleanup, provider failure, and fresh checks after suspension.
SDK integration tests change the authoritative mocked Auth record while retaining
the same browser cookies/JWT and verify that access is denied on the next request.
Browser tests cover localized denial, accessibility, forged browser claims, and HQ
exclusion. All test identities are synthetic; no real user receives a link or role.

Sources: [Supabase metadata trust and JWT freshness](https://supabase.com/docs/guides/database/postgres/row-level-security#authjwt),
[SSR session verification](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
and the installed Next.js authentication/route-handler guides.
