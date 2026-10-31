# Managed migration-role compatibility

The storage proposal is still unapplied. Earlier PostgreSQL 17 setup tests used
a fixture superuser. Supabase’s managed `postgres` role is not a superuser, so
ownership setup required a separate regression check.

## Reproduction

A fresh local PostgreSQL 17.11 login received NOSUPERUSER, CREATEROLE, CREATEDB,
BYPASSRLS, database CREATE permission and an empty `createrole_self_grant`.
The original draft failed with SQLSTATE `42501`:
`must be able to SET ROLE "ggs_pilot_data_owner"`. Rollback left no proposal schema.
No hosted DDL was used for this reproduction.

PostgreSQL 17 grants a non-superuser role creator ADMIN authority on new roles,
but defaults SET/INHERIT to false. ADMIN alone cannot supply ownership privileges.

## Correction

Inside the existing transaction, a non-superuser migrator grants the two newly
created ownership roles to itself with SET/INHERIT. The grantor is explicitly the
current migration role. After schema, policies and routines are configured, it
revokes **its own** grants before commit. The automatic ADMIN-only grant is not
modified. Superusers use the existing path without temporary grants.

Runtime roles receive no ownership membership. Their table/routine permissions
and decision behavior do not change. The migrator remains a trusted administrator
able to administer roles it created; never use it for application connections.

The native suite now applies the draft through a managed-style non-superuser login.
It checks that inherited/SET ownership access and self-granted memberships do not
survive setup, and that the migrator cannot read application data. Existing runtime
role/concurrency/rollback tests run against that resulting schema.

## Revision and gates

Original PR #12 SHA-256:
`F07A7F52ECA42820DDC1502ADFABB12B2DAB7883C3C1F00F4871DE429491A4B7`.

Corrected proposal SHA-256:
`4C5B7347488A02DC8A12C0BB183FA8DCBCB7B5F6DF48B4E533EBB43BCAEBD6BF`.

This changes a quarantined, never-applied draft, not deployed migration history.
The corrected revision needs review and later explicit approval before any live
application. Tests cover vanilla PostgreSQL role attributes, not every managed
platform guard. Dedicated-role hosted authentication, actual driver CA/hostname
verification, privacy/retention/redaction and abuse controls remain separate gates.
No live credential, role, schema, setting, collection/deletion or deployment changes.

Sources: [PostgreSQL 17 role attributes](https://www.postgresql.org/docs/17/role-attributes.html),
[membership](https://www.postgresql.org/docs/17/role-membership.html),
[Supabase managed roles](https://supabase.com/docs/guides/database/postgres/roles-superuser).
