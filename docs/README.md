# GG's foundation documentation

Start with the [repository README](../README.md) to run the site. WP-01 is closed;
the owner approved the [first WP-02 pilot-access increment](wp-02-pilot-access.md).
The [testing-project sign-in increment](wp-02-sign-in.md) is approved for implementation.
The [owner-approved access stage](wp-02-approved-access.md) now binds verified
identity to current trusted admission. Initial owner bootstrap and local Auth settings
were separately approved; the [application/private-review rehearsal](wp-02-application-preview.md)
is merged and supersedes older delivery-time status below. The current increment
is the [unapplied storage/transaction proposal](../proposals/application-storage/README.md).
Account creation, schema/settings changes, operational workspaces, and deployment
still require their corresponding scope decisions.

| I need to…                                               | Read                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Understand the delivered scope and evidence              | [WP-01 status and acceptance](wp-01-status.md)                               |
| Find routes, components, and integration boundaries      | [Architecture](architecture.md)                                              |
| Run, verify, troubleshoot, or hand over a local checkout | [Local runbook](runbook.md)                                                  |
| Understand the brand direction and image provenance      | [Design direction](design-direction.md)                                      |
| Configure the disconnected environment                   | [Environment guide](environment.md) and [example variables](../.env.example) |
| Run tests or understand CI                               | [Testing](testing.md) and [workflow](../.github/workflows/ci.yml)            |
| Understand security limits and reporting                 | [Security policy](../SECURITY.md)                                            |
| Prepare a later staging review                           | [Staging plan](staging-plan.md)                                              |
| Plan the next work package without implementing it       | [WP-02 handoff](wp-02-handoff.md)                                            |

## Canonical sources

The implementation and lockfile determine current behavior. These documents link to
the corresponding modules instead of defining separate versions of configuration,
routes, or security policy. Update the relevant guide when changing those modules.

The environment guide owns the variable contract, the testing guide owns test/CI
commands and coverage, and the staging plan owns release prerequisites. The handoff
summarizes open decisions and points back to those guides.

## Review sequence

PR-01 bootstrap → PR-02 design/localization → PR-03 disconnected boundaries →
PR-04 quality/security/staging preparation → PR-05 documentation/handoff.

Each PR stops for review. WP-01 is ready to close only after PR-05 is reviewed and
merged with passing checks. That closes the foundation package, not a production
launch and not authorization to start WP-02.
