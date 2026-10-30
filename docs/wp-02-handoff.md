# WP-02 handoff — planning only

## What the next work package receives

The repository contains the reviewed application foundation, modern creator/talent
design direction, two-language routing, three preview shells, disconnected service
boundaries, and automated quality/security checks. Start with
[architecture](architecture.md), [environment](environment.md), and the
[WP-01 acceptance record](wp-01-status.md).

This is the historical planning handoff. The owner subsequently approved the proposed
closed-pilot access package. The [current first-increment contract](wp-02-pilot-access.md)
now records its scope and review boundary. This handoff does not authorize additional
business features, live resources, or deployment beyond that contract.

## Preserve these foundation decisions

- Spanish remains the default; English navigation/content stays complete.
- Keep Roboto and the approved sleek, youthful-but-professional global talent,
  social/livestream technology direction. Extend shared components/tokens rather
  than making the shells diverge accidentally.
- Keep the Next.js/strict-TypeScript/pnpm conventions, lockfile policy, and current
  unit/integration/browser/security gates.
- Keep public and server environment access separate. Never introduce privileged
  keys into browser fields or share server sessions across visitors.
- HQ/streamer previews are currently public and contain no private data. They are
  not a role or permission model. Define the actual access model before adding
  sensitive content.

## Decisions needed before implementation

| Decision                     | Owner input / acceptance evidence needed                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-02 objective and boundary | Name the actual capability, user outcome, non-goals, dependencies, and completion criteria.                                                                                                 |
| Actors and access            | Define visitors, approved pilot participants, operational staff, and any other actual actors. Approve a route/action permission matrix rather than assuming shell names are roles.          |
| Pilot policy, if applicable  | Confirm invitation/approval rules, recruitment visibility, onboarding gates, and expansion controls. No public sign-up or recruitment opening is implied by this foundation.                |
| Authentication, if in scope  | Choose sign-in/provider strategy, session/cookie behavior, error/recovery flows, and required tests. No provider, callback, or login method is selected here.                               |
| Data, if in scope            | Approve entities, fields, ownership, data sensitivity, retention, and validation before writing schema or migrations.                                                                       |
| Services and environments    | Approve each service/account/project and access boundary separately. Keep staging/production resources distinct; no existing production credentials or data are authorized by this handoff. |
| Hosting/deployment           | Select host, access gate, URL, release approver, and rollback criteria before executing the staging plan.                                                                                   |
| PR breakdown                 | Approve small reviewable increments and specific acceptance tests before expanding implementation.                                                                                          |

These are planning questions for the next package, not requests to create resources
or implementation tickets whose business details have already been agreed.

## If service integration is later approved

The current enable flag deliberately rejects `true`, and the factories throw before
SDK/cookie/network activity. Adding credentials cannot activate the scaffold. A new
reviewed change must explicitly revise this behavior and prove the resulting access
model. See the [integration prerequisites](environment.md#module-boundaries).

Before accepting any private or user-generated data, implement and test the approved
authentication/authorization, session refresh and cookie propagation, server trust
boundaries, schema/RLS and generated types as applicable. Review the static CSP's
inline-script allowance, device permissions, and external-origin restrictions before
adding live content, camera/microphone usage, OAuth, or service calls. Do not work
around those restrictions silently.

No Supabase project needs to be inspected or created merely to read this handoff.
Use connected tools only when the owner has approved the corresponding later task.

## Entry and review gates

1. Finish PR-05 review/merge and record WP-01 acceptance.
2. Approve a specific WP-02 brief and its non-goals; resolve relevant decisions above.
3. Recheck the latest main branch, required CI, dependency advisories, and applicable
   repository instructions. Preserve unrelated local changes.
4. Implement only the first approved increment; stop at its review boundary.
5. Treat service connection, account creation, schema changes, and deployment as
   explicit scope decisions, never as implied consequences of approving a design.

If required approval or repository/service access is missing, report the concrete
blocker. Do not guess business requirements or substitute production resources.
