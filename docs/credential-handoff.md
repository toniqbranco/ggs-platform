# Credential handoff coordinator — simulated gateway only

This increment adds a quarantined [Windows coordinator](../proposals/application-storage/credential-handoff.psm1)
over the [encrypted credential store](windows-credential-store.md). Importing it
performs no operation. No application, route, startup or database driver imports
it. There is **no default live gateway**, provider token, admin password, SQL
transport, CLI invocation or live provisioning command in this increment.

## Sequence and checks

The in-process API requires Windows/PowerShell 7.4+, a non-production runtime,
an explicit checkout path and `reviewed-gg-livestream-testing-provisioning`.
That string is an accident-prevention gate, not user authorization. Five trusted
callbacks must be explicitly supplied; an incomplete gateway fails before files.
Every receipt is bound to the exact testing project and a fresh operation UUID.

1. **Preflight:** verify the real target, both proposed names absent, owner
   configuration empty and no persistent schema CREATE authority. Reject missing,
   malformed, wrong-project or adverse evidence before secret persistence.
2. **Storage:** generate distinct 32-byte CSPRNG values and hex-encode them into
   the exact existing bundle schema. Encrypt/flush/read back through the store.
   No password is passed through command arguments, an environment variable or
   a plaintext file. Refuse existing bundles; never rotate or resume implicitly.
3. **PrepareDisabled:** reopen the saved bundle through validated DPAPI/ACLs and
   compare it to the generated input. Only then invoke the trusted callback to
   provision both identities with passwords and entry-group membership, remaining
   **NOLOGIN**. Require an exact `both-disabled` receipt for this operation.
4. **Enable:** invoke the callback only after that receipt. Treat the attempt as
   consequential before waiting for acknowledgement: timeout/error may mean it
   committed. Require an exact `both-enabled` receipt.
5. **Verify:** reopen the encrypted bundle and invoke the trusted authenticated
   identity/TLS/effective-permission checks. Require the operation-bound verification
   receipt. Only then return a small nonsensitive success record.

Before an enable attempt, a failure stops without retry, enabling or destructive
cleanup. The encrypted bundle is preserved once saved, even if disabled-role
preparation fails or has an unknown outcome. Inspect actual state before deciding
whether any new roles exist; do not label an uncertain preparation “rolled back.”

After any attempted enable, failure invokes the **Disable** callback, including
when the enable acknowledgement is lost. That callback must match operation
markers on both exact newly created identities before disabling them and closing
their existing sessions. It must never target pre-existing/unrelated identities.
Success is accepted only as `both-disabled-sessions-closed`; absent/failed/bad
recovery receipts produce **unconfirmed**, never a claim that access is revoked.
Disabling LOGIN alone does not close already established connections.

No DROP, password reset, bundle overwrite, automatic retry or intake switch is
included. Errors expose only the safe phase, recovery status and operation UUID;
the encrypted bundle and UUID remain available for reviewed reconciliation.
Successful output contains only operation UUID, project ID and verified outcome.

## Trusted gateway contract and missing live integration

Callbacks are trusted operator code, not input from a page, applicant or database
record. Receipt shape checks do not make a dishonest gateway truthful. A real
adapter must bind every provider operation to project `rchxnmpsxfbsicthasxn` and
verify real target metadata, use transactional creation/enable operations, refuse
name conflicts, preserve operation ownership markers and independently inspect
actual resulting profiles/ACLs. It must neither emit secrets into tool/process
logs nor supply privileged credentials to the application.

The two exact proposed identities and inherited CONNECT/TEMP baseline remain in
the [setup review](windows-credential-store.md#exact-later-login-setup--proposed-not-executed).
Only their matching entry group is allowed, with INHERIT true, SET/ADMIN false,
and no administrative, owner/executor, schema CREATE or table-write privileges.
The authenticated smoke test must verify both actual login/session identities,
tenant/database selection, TLS and effective privileges without application rows,
owner seeding or invitations. Recovery must verify session termination through
the actual managed pooler; do not grant broader runtime rights to achieve it.

**The real provider adapter is not implemented.** No receipt from these tests is
hosted evidence. Before requesting permission to create real logins, review that
adapter's authentication and secret transport, concrete creation/grant/operation
marker SQL, encrypted handoff and authenticated/recovery operations. If available
tools cannot perform this without violating secret-handling boundaries, report
that access/transport blocker rather than printing passwords or assuming access.

Consumers/gateways retain the store's in-process trust/memory limitations: no
transcripts, other-stream logging or arbitrary credential transmission. DPAPI is
Windows-user-bound and does not protect against a compromised same-user process
or privileged administrator. No production secret-store choice is made here.

## Verification

[Twelve new Windows cases](../tests/windows/credential-handoff.test.ps1) use an
in-memory fake gateway with real DPAPI persistence under checked temporary paths.
They cover successful ordering/read-back, invalid context/target/gateway, existing
roles, unsafe storage, uncertain preparation, wrong-operation receipts, lost
enable acknowledgement, failed recovery and no-overwrite reruns. The fake gateway
has no network or SQL code; generated values are fixture material, not credentials
for an existing account. All owned fixture files are removed after each run.

The existing Windows job runs both scripts sequentially: 24 Windows cases, plus
the unchanged 263 ordinary/native/browser cases, for **287 total** across four
jobs. The live app, schema, role membership, Auth, owner seed, application data,
invitations, intake and deployment remain unchanged by this stage.
