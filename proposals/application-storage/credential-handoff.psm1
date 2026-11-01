#Requires -Version 7.4
# Quarantined coordinator. No default gateway, network transport or invocation.
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'local-secret-store.psm1') -Scope Local

function Invoke-GgsTestingCredentialHandoff {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$CheckoutRoot,
    [Parameter(Mandatory)][string]$Acknowledgement,
    [Parameter(Mandatory)][hashtable]$Gateway)
  $operation = [guid]::NewGuid().ToString()
  $phase = 'context'
  $enableAttempted = $false
  $recovery = 'not-required'
  $project = 'rchxnmpsxfbsicthasxn'
  $storeAck = 'reviewed-gg-livestream-testing'
  try {
    if (-not $IsWindows -or $env:APP_ENV -eq 'production' -or $env:NODE_ENV -eq 'production' -or
      $Acknowledgement -cne 'reviewed-gg-livestream-testing-provisioning') { throw 'deny' }
    $expected = @('Preflight','PrepareDisabled','Enable','Verify','Disable')
    if ($Gateway.Count -ne $expected.Count) { throw 'deny' }
    foreach ($name in $expected) {
      if ($Gateway[$name] -isnot [scriptblock]) { throw 'deny' }
    }
    $phase = 'preflight'
    $preflight = & $Gateway.Preflight $project $operation
    if ($preflight -isnot [hashtable] -or $preflight.Count -ne 4 -or
      $preflight['projectId'] -cne $project -or $preflight['rolesAbsent'] -isnot [bool] -or
      -not $preflight['rolesAbsent'] -or $preflight['ownerEmpty'] -isnot [bool] -or
      -not $preflight['ownerEmpty'] -or $preflight['publicCreate'] -isnot [bool] -or
      $preflight['publicCreate']) { throw 'deny' }

    $phase = 'storage'
    # These generated values become credentials only in an approved real gateway.
    # No arguments, environment variables, plaintext files or output carry them.
    $bundle = @{ version = 1; projectId = $project }
    foreach ($kind in @('intake','review')) {
      $random = [byte[]]::new(32)
      try {
        [Security.Cryptography.RandomNumberGenerator]::Fill($random)
        $bundle[$kind] = @{ user = "ggs_pilot_${kind}_login.$project";
          password = [Convert]::ToHexString($random).ToLowerInvariant() }
      } finally { [Array]::Clear($random,0,$random.Length) }
    }
    Save-GgsTestingCredentialBundle -CheckoutRoot $CheckoutRoot -Bundle $bundle -Acknowledgement $storeAck

    $phase = 'prepare-disabled'
    $prepared = @{ receipt = $null }
    $prepareConsumer = {
      param($stored)
      if ($stored.intake.password -cne $bundle.intake.password -or
        $stored.review.password -cne $bundle.review.password) { throw 'deny' }
      $prepared.receipt = & $Gateway.PrepareDisabled $project $operation $stored
    }.GetNewClosure()
    Invoke-GgsWithTestingCredentials -CheckoutRoot $CheckoutRoot -Acknowledgement $storeAck -Consumer $prepareConsumer
    $receipt = $prepared.receipt
    if ($receipt -isnot [hashtable] -or $receipt.Count -ne 3 -or
      $receipt['projectId'] -cne $project -or $receipt['operationId'] -cne $operation -or
      $receipt['state'] -cne 'both-disabled') { throw 'deny' }

    $phase = 'enable'
    # Set before calling: a lost acknowledgement may hide a committed enable.
    $enableAttempted = $true
    $enabled = & $Gateway.Enable $project $operation
    if ($enabled -isnot [hashtable] -or $enabled.Count -ne 3 -or
      $enabled['projectId'] -cne $project -or $enabled['operationId'] -cne $operation -or
      $enabled['state'] -cne 'both-enabled') { throw 'deny' }

    $phase = 'verify'
    $verified = @{ receipt = $null }
    $verifyConsumer = {
      param($stored)
      $verified.receipt = & $Gateway.Verify $project $operation $stored
    }.GetNewClosure()
    Invoke-GgsWithTestingCredentials -CheckoutRoot $CheckoutRoot -Acknowledgement $storeAck -Consumer $verifyConsumer
    $receipt = $verified.receipt
    if ($receipt -isnot [hashtable] -or $receipt.Count -ne 3 -or
      $receipt['projectId'] -cne $project -or $receipt['operationId'] -cne $operation -or
      $receipt['state'] -cne 'identity-tls-permissions-verified') { throw 'deny' }
    # Only nonsensitive evidence leaves the coordinator. No retry or intake switch.
    return @{ operationId = $operation; outcome = 'verified'; projectId = $project }
  } catch {
    if ($enableAttempted) {
      $recovery = 'unconfirmed'
      try {
        # Trusted gateway MUST first match operation markers on both new roles.
        # It disables only this operation's identities and terminates their existing
        # sessions, never pre-existing/unrelated roles. No DROP or password reset.
        $disabled = & $Gateway.Disable $project $operation
        if ($disabled -is [hashtable] -and $disabled.Count -eq 3 -and
          $disabled['projectId'] -ceq $project -and $disabled['operationId'] -ceq $operation -and
          $disabled['state'] -ceq 'both-disabled-sessions-closed') { $recovery = 'confirmed-disabled' }
      } catch { $recovery = 'unconfirmed' }
    }
    # Preserve encrypted bundle and operation ID for deliberate reconciliation.
    # Never return raw gateway/store errors, payloads, passwords or exception causes.
    throw [InvalidOperationException]::new("GG testing handoff incomplete; phase=$phase; recovery=$recovery; operation=$operation")
  }
}

Export-ModuleMember -Function Invoke-GgsTestingCredentialHandoff
